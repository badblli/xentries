from __future__ import annotations

import asyncio
import json
import random
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote

import httpx
from redis.asyncio import Redis

from config import Settings

settings = Settings()
LOG_DEDUPE_WINDOW_SEC = 60
last_error_log: dict[tuple[str, str], float] = {}
next_due_at: dict[str, float] = {}


def should_log(monitor_id: str, reason: str) -> bool:
    now = time.time()
    key = (monitor_id, reason)
    last = last_error_log.get(key, 0)
    if now - last < LOG_DEDUPE_WINDOW_SEC:
        return False
    last_error_log[key] = now
    return True


async def x_request(path: str, params: dict[str, Any]) -> dict[str, Any]:
    token = settings.x_bearer_token
    if not token:
        raise RuntimeError("PROVIDER_MISCONFIGURED")

    url = httpx.URL(f"https://api.x.com/2{path}", params={k: v for k, v in params.items() if v is not None})
    headers = {"Authorization": f"Bearer {unquote(token)}"}

    retries = settings.provider_max_retries
    for attempt in range(retries + 1):
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, headers=headers)
        if response.status_code < 400:
            return response.json()
        if response.status_code in (429, 500, 502, 503, 504) and attempt < retries:
            delay_ms = min(settings.provider_backoff_ms * (2**attempt), 20000) + random.randint(0, 250)
            await asyncio.sleep(delay_ms / 1000)
            continue
        if response.status_code in (401, 403):
            raise RuntimeError("PROVIDER_UNAUTHORIZED")
        raise RuntimeError(f"PROVIDER_ERROR:{response.status_code}")

    raise RuntimeError("PROVIDER_RETRIES_EXHAUSTED")


def normalize_event(tweet: dict[str, Any], monitor: dict[str, Any], event_type: str) -> dict[str, Any]:
    public = tweet.get("public_metrics", {})
    tweet_id = str(tweet.get("id"))
    author_id = str(tweet.get("author_id", ""))
    username = monitor.get("query", "unknown").replace("@", "")

    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "eventVersion": 1,
        "type": event_type,
        "provider": "x",
        "providerItemId": tweet_id,
        "monitorId": monitor["id"],
        "customerId": monitor["customerId"],
        "occurredAt": tweet.get("created_at") or now_iso,
        "payload": {
            "tweetId": tweet_id,
            "text": tweet.get("text", ""),
            "authorId": author_id,
            "authorUsername": username,
            "createdAt": tweet.get("created_at") or now_iso,
            "url": f"https://x.com/{username}/status/{tweet_id}",
            "metrics": {
                "likeCount": int(public.get("like_count", 0)),
                "retweetCount": int(public.get("retweet_count", 0)),
                "replyCount": int(public.get("reply_count", 0)),
            },
        },
    }


def monitor_signature(monitor: dict[str, Any]) -> str:
    monitor_type = monitor.get("type", "keyword")
    query = monitor.get("query", "")
    return f"{monitor_type}:{query}"


def shared_since_id(monitors: list[dict[str, Any]]) -> str | None:
    candidates: list[int] = []
    for monitor in monitors:
        cursor = str(monitor.get("lastCursor") or "").strip()
        if cursor.isdigit():
            candidates.append(int(cursor))

    if not candidates:
        return None

    # Fetch from the oldest cursor once, then fan-out to all monitors.
    return str(min(candidates))


async def fetch_for_group(monitors: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str | None]:
    sample = monitors[0]
    monitor_type = sample.get("type", "keyword")
    query = sample.get("query", "")
    since_id = shared_since_id(monitors)

    if monitor_type == "keyword":
        response = await x_request(
            "/tweets/search/recent",
            {
                "query": query,
                "max_results": 25,
                "since_id": since_id,
                "tweet.fields": "author_id,created_at,public_metrics",
            },
        )
        tweets = response.get("data", [])
        new_cursor = tweets[0]["id"] if tweets else since_id
        return tweets, new_cursor

    if monitor_type == "user":
        user_id = query.replace("id:", "").strip()
        response = await x_request(
            f"/users/{user_id}/tweets",
            {
                "max_results": 25,
                "since_id": since_id,
                "tweet.fields": "author_id,created_at,public_metrics",
            },
        )
        tweets = response.get("data", [])
        new_cursor = tweets[0]["id"] if tweets else since_id
        return tweets, new_cursor

    username = query.replace("@", "").strip()
    mention_query = f"to:@{username} OR @{username}"
    response = await x_request(
        "/tweets/search/recent",
        {
            "query": mention_query,
            "max_results": 25,
            "since_id": since_id,
            "tweet.fields": "author_id,created_at,public_metrics",
        },
    )
    tweets = response.get("data", [])
    new_cursor = tweets[0]["id"] if tweets else since_id
    return tweets, new_cursor


async def update_cursor(monitor_id: str, cursor: str | None) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        await client.post(
            f"{settings.api_base_url}/internal/monitors/{monitor_id}/cursor",
            headers={"x-collector-token": settings.collector_token},
            json={"cursor": cursor},
        )


async def list_monitors() -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{settings.api_base_url}/internal/monitors",
            headers={"x-collector-token": settings.collector_token},
            params={"provider": "x"},
        )
        resp.raise_for_status()
        return resp.json().get("items", [])


def due_monitors(monitors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = time.time()
    due: list[dict[str, Any]] = []
    for monitor in monitors:
        monitor_id = monitor["id"]
        if now >= next_due_at.get(monitor_id, 0):
            due.append(monitor)
    return due


def schedule_next(monitor: dict[str, Any]) -> None:
    interval = max(int(monitor.get("pollingIntervalSec", 60)), 15)
    next_due_at[monitor["id"]] = time.time() + min(interval, 120)


async def loop() -> None:
    redis = Redis.from_url(settings.redis_url, decode_responses=True)

    while True:
        try:
            monitors = await list_monitors()
            if not monitors:
                await asyncio.sleep(5)
                continue

            ready = due_monitors(monitors)
            if not ready:
                await asyncio.sleep(1)
                continue

            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for monitor in ready:
                grouped[monitor_signature(monitor)].append(monitor)

            for signature, group in grouped.items():
                try:
                    tweets, new_cursor = await fetch_for_group(group)
                except RuntimeError as exc:
                    reason = str(exc)
                    for monitor in group:
                        if should_log(monitor["id"], reason):
                            if reason == "PROVIDER_MISCONFIGURED":
                                print(
                                    f"[collector] X provider misconfigured for monitor={monitor['id']}. "
                                    "Set X_BEARER_TOKEN/TWITTER_BEARER_TOKEN."
                                )
                            elif reason == "PROVIDER_UNAUTHORIZED":
                                print(
                                    f"[collector] X provider unauthorized for monitor={monitor['id']}. "
                                    "Ask admin to refresh provider token."
                                )
                            else:
                                print(f"[collector] provider error monitor={monitor['id']} reason={reason}")
                        schedule_next(monitor)
                    continue

                if len(group) > 1:
                    print(f"[collector] fanout shared_fetch signature={signature} monitors={len(group)} tweets={len(tweets)}")

                for monitor in group:
                    events: list[dict[str, Any]] = []
                    for tweet in tweets:
                        for event_type in monitor.get("eventTypes", []):
                            events.append(normalize_event(tweet, monitor, event_type))

                    for event in reversed(events):
                        await redis.xadd(settings.stream_key, {"payload": json.dumps(event)})

                    await update_cursor(monitor["id"], new_cursor)
                    schedule_next(monitor)

            await asyncio.sleep(0.5)
        except Exception as exc:
            print(f"[collector] loop error: {exc}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(loop())
