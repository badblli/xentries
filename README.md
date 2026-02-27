# Xentries Monorepo

Docker-first, SaaS-ready realtime social event gateway.

Bu proje X (official API) verisini monitor eder, normalize eder, event olarak saklar ve API + WebSocket + Webhook üzerinden yayınlar.

## Uyum ve Güvenlik
- Scraping yok
- Stealth browsing yok
- Captcha bypass yok
- ToS circumvention yok
- Sadece resmi/authorized X API endpointleri
- API key hash olarak saklanır (`argon2`)
- Webhook imzası: `HMAC_SHA256(rawBody, webhookSecret)`

## Mimari Özeti
- `apps/api`: Fastify + Prisma + Swagger + WebSocket
- `apps/worker`: BullMQ worker + Redis stream consumer + webhook/extraction jobs
- `apps/collector`: Python async poller (X API) + Redis stream publisher
- `apps/web`: Next.js dashboard (login, pricing, monitors, events, webhooks, extractions, settings)
- `packages/shared`: ortak Zod contract/type paketleri
- `legacy`: eski `backend/` ve `frontend/` arşivi

Akış:
1. Collector aktif monitorleri API’den alır.
2. X API’den veriyi çeker.
3. Event contract ile normalize edip Redis Stream `xgateway:events` içine yazar.
4. Worker stream’i consume eder, dedupe ile DB’ye insert eder.
5. Worker webhook delivery job üretir ve WS fanout pub/sub yayınlar.
6. API, REST ve `/ws` üzerinden clientlara servis eder.

## Repo Yapısı
```text
.
├─ apps/
│  ├─ api/
│  ├─ worker/
│  ├─ collector/
│  └─ web/
├─ packages/
│  └─ shared/
├─ legacy/
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

## Event Contract
Kaynak: `packages/shared/src/contracts.ts`

Ana alanlar:
- `eventVersion: 1`
- `type: "tweet.new" | "mention.new" | "reply.new" | "user.tweet.new"`
- `provider: "x"`
- `providerItemId: string`
- `monitorId: string`
- `customerId: string`
- `occurredAt: ISO datetime`
- `payload`:
  - `tweetId`
  - `text`
  - `authorId`
  - `authorUsername`
  - `createdAt`
  - `url`
  - `metrics.likeCount`
  - `metrics.retweetCount`
  - `metrics.replyCount`

## Veri Modeli (Prisma)
Kaynak: `apps/api/prisma/schema.prisma`

Tablolar:
- `Customer`
- `Webhook`
- `Monitor`
- `Event`
- `ExtractionJob`
- `ProviderToken`
- `WebhookDeliveryAttempt`

Kritik kısıt:
- Event dedupe unique key:
  - `(customerId, monitorId, providerItemId, type)`

## ENV Uyumluluğu
Önce `.env.example` dosyasını `.env` olarak kopyalayın:

```bash
cp .env.example .env
```

Windows PowerShell:
```powershell
Copy-Item .env.example .env
```

Korunan mevcut X key’leri:
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_REDIRECT_URI`
- `X_BEARER_TOKEN`

Fallback alias sırası:
- `X_BEARER_TOKEN <- TWITTER_BEARER_TOKEN <- BEARER_TOKEN`
- `X_CLIENT_ID <- TWITTER_CLIENT_ID`
- `X_CLIENT_SECRET <- TWITTER_CLIENT_SECRET`
- `X_REDIRECT_URI <- TWITTER_REDIRECT_URI`

Runtime için kritik env:
- `DATABASE_URL`
- `REDIS_URL`
- `API_PORT`
- `WEB_PORT`
- `COLLECTOR_INTERNAL_TOKEN`
- `OWNER_CUSTOMER_NAME`
- `OWNER_API_KEY` (opsiyonel ama önerilir)
- `WEBHOOK_MAX_ATTEMPTS`
- `WEBHOOK_BACKOFF_MS`

Not:
- `OWNER_API_KEY` boş bırakılırsa ilk seed’de üretilir ve API logunda bir kez yazdırılır.
- Üretimde secret’ları git’e koymayın.

## Docker ile Çalıştırma
Tek komut:

```bash
docker compose up --build
```

Arka planda:
```bash
docker compose up --build -d
```

Servisler:
- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Web App: `http://localhost:3000`
- Pricing: `http://localhost:3000/pricing`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

Durum kontrol:
```bash
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f collector
docker compose logs -f web
```

Kapatma:
```bash
docker compose down
```

Data ile birlikte temiz kapatma:
```bash
docker compose down -v
```

## İlk Kurulum ve API Key
İlk çalıştırmada API otomatik:
- migrate deploy
- seed owner customer
- start

Key almak için:
```bash
docker compose logs api | grep "API key"
```

Öneri:
- `.env` içine `OWNER_API_KEY=...` yazarak sabitleyin.

## API Kullanımı
Header:
- `x-api-key: <OWNER_API_KEY>`

Canonical base path:
- `/api/v1`
- `/v1` compatibility alias olarak korunur.

Hata formatı:
```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

Rate limit (API key bazlı):
- `10 req/s` sustained
- `20` burst

### Health
```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

### Monitor CRUD
Canonical liste:
```bash
curl -H "x-api-key: <KEY>" http://localhost:8000/api/v1/monitors
```

Liste:
```bash
curl -H "x-api-key: <KEY>" http://localhost:8000/v1/monitors
```

Oluştur:
```bash
curl -X POST http://localhost:8000/v1/monitors \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{
    "type": "keyword",
    "query": "from:openai OR #ai",
    "pollingIntervalSec": 60,
    "eventTypes": ["tweet.new", "mention.new"]
  }'
```

Detay:
```bash
curl -H "x-api-key: <KEY>" http://localhost:8000/v1/monitors/<MONITOR_ID>
```

Güncelle:
```bash
curl -X PATCH http://localhost:8000/v1/monitors/<MONITOR_ID> \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"isActive": false}'
```

Sil:
```bash
curl -X DELETE -H "x-api-key: <KEY>" http://localhost:8000/v1/monitors/<MONITOR_ID>
```

### Events
```bash
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/v1/events?page=1&pageSize=20"
```

Filtreli:
```bash
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/v1/events?monitorId=<MONITOR_ID>&type=tweet.new&page=1&pageSize=20"
```

### X Proxy Endpointleri
```bash
curl -H "x-api-key: <KEY>" "http://localhost:8000/v1/search/tweets?query=from:openai"
curl -H "x-api-key: <KEY>" "http://localhost:8000/v1/tweets/<TWEET_ID>"
curl -H "x-api-key: <KEY>" "http://localhost:8000/v1/users/<USER_ID>"
curl -H "x-api-key: <KEY>" "http://localhost:8000/v1/users/<USER_ID>/timeline"
```

### Webhooks
Canonical liste:
```bash
curl -H "x-api-key: <KEY>" http://localhost:8000/api/v1/webhooks
```

Canonical oluştur:
```bash
curl -X POST http://localhost:8000/api/v1/webhooks \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"url":"https://example.com/webhook","isActive":true}'
```

Canonical güncelle:
```bash
curl -X PATCH http://localhost:8000/api/v1/webhooks/<WEBHOOK_ID> \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"isActive":false}'
```

Canonical delivery geçmişi:
```bash
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/api/v1/webhooks/<WEBHOOK_ID>/deliveries?limit=20"
```

Liste:
```bash
curl -H "x-api-key: <KEY>" http://localhost:8000/v1/webhooks
```

Oluştur:
```bash
curl -X POST http://localhost:8000/v1/webhooks \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"url":"https://example.com/webhook"}'
```

Test gönderimi:
```bash
curl -X POST -H "x-api-key: <KEY>" \
  http://localhost:8000/v1/webhooks/<WEBHOOK_ID>/test
```

Sil:
```bash
curl -X DELETE -H "x-api-key: <KEY>" \
  http://localhost:8000/v1/webhooks/<WEBHOOK_ID>
```

Webhook header’ları:
- `x-signature`
- `x-event-type`
- `x-event-id`
- `x-event-version`

### Extractions (Phase 3)
Canonical endpointler:
- `POST /api/v1/extractions`
- `GET /api/v1/extractions`
- `GET /api/v1/extractions/:id?offset=&limit=`
- `POST /api/v1/extractions/:id/estimate`
- `GET /api/v1/extractions/:id/export?format=json|csv|xlsx|md`

MVP tool listesi:
- `x.search_results`
- `x.tweet_replies`
- `x.tweet_quotes`
- `x.tweet_retweets`
- `x.user_followers`
- `x.user_following`
- `x.user_posts`
- `x.mentions`
- `x.people_search`
- `x.thread`

Coming soon (safe placeholder):
- `x.lists`
- `x.spaces`
- `x.communities`

Oluştur:
```bash
curl -X POST http://localhost:8000/api/v1/extractions \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"tool":"x.search_results","params":{"query":"from:openai"}}'
```

Liste:
```bash
curl -H "x-api-key: <KEY>" http://localhost:8000/api/v1/extractions
```

Detay (paged rows):
```bash
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/api/v1/extractions/<EXTRACTION_ID>?offset=0&limit=100"
```

Estimate:
```bash
curl -X POST http://localhost:8000/api/v1/extractions/<EXTRACTION_ID>/estimate \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{}'
```

Export:
```bash
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/api/v1/extractions/<EXTRACTION_ID>/export?format=json"
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/api/v1/extractions/<EXTRACTION_ID>/export?format=csv"
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/api/v1/extractions/<EXTRACTION_ID>/export?format=xlsx" -o extraction.xlsx
curl -H "x-api-key: <KEY>" \
  "http://localhost:8000/api/v1/extractions/<EXTRACTION_ID>/export?format=md"
```

Kural:
- Export üst sınırı: `50,000` satır.

### Settings
```bash
curl -H "x-api-key: <KEY>" http://localhost:8000/api/v1/account
curl -X PATCH http://localhost:8000/api/v1/account \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"locale":"tr"}'
curl -H "x-api-key: <KEY>" http://localhost:8000/api/v1/api-keys
curl -H "x-api-key: <KEY>" http://localhost:8000/api/v1/settings/provider-status
curl -H "x-api-key: <KEY>" http://localhost:8000/v1/settings/quota
curl -H "x-api-key: <KEY>" http://localhost:8000/v1/settings/provider-status
```

### Trends (Phase 4)
15 dakika cache ile safe stub döner. Resmi provider trend endpoint'i MVP'de desteklenmiyorsa scraping yapmadan `not_supported` yanıtı verir.

```bash
curl -H "x-api-key: <KEY>" "http://localhost:8000/api/v1/trends?region=TR"
curl -H "x-api-key: <KEY>" "http://localhost:8000/v1/trends?region=US"
```

### MCP Server (Phase 5)
MCP endpointleri:
- `POST /mcp` (canonical)
- `POST /api/mcp` (alias)
- `GET /mcp` (tool introspection)

Auth:
- `x-api-key: <KEY>`
- Transport: `StreamableHTTP`

Örnek initialize:
```bash
curl -X POST http://localhost:8000/mcp \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Örnek tools/list:
```bash
curl -X POST http://localhost:8000/mcp \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Örnek tools/call:
```bash
curl -X POST http://localhost:8000/mcp \
  -H "content-type: application/json" \
  -H "x-api-key: <KEY>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_monitors","arguments":{}}}'
```

Desteklenen MCP araçları:
- `list_monitors`
- `create_monitor`
- `update_monitor`
- `list_events`
- `search_tweets`
- `create_extraction`
- `get_extraction`
- `export_extraction`
- `create_webhook`
- `list_webhooks`

Bağlantı notları:
- Cursor/Codex: MCP URL olarak `http://localhost:8000/mcp`, header olarak `x-api-key` gönderin.
- Claude Desktop: custom MCP server URL `http://localhost:8000/mcp` ve header `x-api-key` ile bağlayın.

### Cost Optimizations (Phase 7)
- Collector aynı hedefe bakan monitorleri grup halinde işler (`shared_fetch + fanout`).
- Aynı hedef için provider çağrısı tek sefer yapılır, eventler ilgili monitor/customer setlerine dağıtılır.
- Polling döngüsü monitor başına bloklayıcı uyku yerine `due-scheduler` yaklaşımıyla çalışır.

## WebSocket Kullanımı
Endpoint:
- `ws://localhost:8000/ws`

`wscat` örneği:
```bash
wscat -c ws://localhost:8000/ws -H "x-api-key: <KEY>"
```

Abonelik mesajı:
```json
{"action":"subscribe","monitorId":"<MONITOR_ID>"}
```

Server push payload:
- `packages/shared` içindeki `gatewayEventSchema`

## Dashboard Sayfaları
- `/login`
- `/pricing` (aylık/yıllık paket toggle)
- `/dashboard`
- `/monitors`
- `/events`
- `/webhooks`
- `/extractions`
- `/settings`
- `/docs`

## Local Geliştirme (Docker’sız opsiyonel)
```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Root scriptler:
- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm format`

## Testler
Çalıştır:
```bash
pnpm test
```

Mevcut kapsam:
- webhook signature generate/verify (`apps/api/tests/webhook-signature.test.ts`)
- dedupe error mapping (`apps/api/tests/monitor-dedupe.test.ts`)
- extraction pagination/export limit/markdown (`apps/api/tests/extractions-phase3.test.ts`)
- shared contract tests (`packages/shared/src/contracts.test.ts`)

## Troubleshooting
API health çalışmıyorsa:
- `docker compose logs api`
- `.env` içinde `DATABASE_URL`, `REDIS_URL`, `X_BEARER_TOKEN` kontrol edin.

Collector event üretmiyorsa:
- aktif monitor var mı kontrol edin
- `docker compose logs collector`
- `X_BEARER_TOKEN` yetki/scope kontrol edin.

Worker delivery yapmıyorsa:
- `docker compose logs worker`
- webhook endpoint’iniz dış dünyadan erişilebilir mi kontrol edin.

Web login’de key kabul edilmiyorsa:
- `OWNER_API_KEY` değeri ile UI’ye girin
- eski DB seed key’i ile `.env` key’i farklıysa DB resetleyin:
```bash
docker compose down -v
docker compose up --build
```

## Üretim Notları
- Bu repo local için docker-first hazırdır.
- Production için managed Postgres/Redis, gerçek auth/signup, billing ve domain routing eklenmelidir.
- Tavsiye domain yapısı:
  - `app.xentries.com`
  - `api.xentries.com`
  - `docs.xentries.com`

