import { z } from "zod";

export const extractionTools = [
  { tool: "x.search_results", implemented: true, comingSoon: false, paramsSchema: z.object({ query: z.string().min(1) }) },
  { tool: "x.tweet_replies", implemented: true, comingSoon: false, paramsSchema: z.object({ tweetId: z.string().min(1) }) },
  { tool: "x.tweet_quotes", implemented: true, comingSoon: false, paramsSchema: z.object({ tweetId: z.string().min(1) }) },
  { tool: "x.tweet_retweets", implemented: true, comingSoon: false, paramsSchema: z.object({ tweetId: z.string().min(1) }) },
  {
    tool: "x.user_followers",
    implemented: true,
    comingSoon: false,
    paramsSchema: z.object({ userId: z.string().min(1).optional(), username: z.string().min(1).optional() }).refine((v) => !!v.userId || !!v.username),
  },
  {
    tool: "x.user_following",
    implemented: true,
    comingSoon: false,
    paramsSchema: z.object({ userId: z.string().min(1).optional(), username: z.string().min(1).optional() }).refine((v) => !!v.userId || !!v.username),
  },
  {
    tool: "x.user_posts",
    implemented: true,
    comingSoon: false,
    paramsSchema: z.object({ userId: z.string().min(1).optional(), username: z.string().min(1).optional() }).refine((v) => !!v.userId || !!v.username),
  },
  {
    tool: "x.mentions",
    implemented: true,
    comingSoon: false,
    paramsSchema: z
      .object({ userId: z.string().min(1).optional(), username: z.string().min(1).optional(), query: z.string().min(1).optional() })
      .refine((v) => !!v.query || !!v.userId || !!v.username),
  },
  { tool: "x.people_search", implemented: true, comingSoon: false, paramsSchema: z.object({ query: z.string().min(1) }) },
  { tool: "x.thread", implemented: true, comingSoon: false, paramsSchema: z.object({ tweetId: z.string().min(1) }) },
  { tool: "x.lists", implemented: false, comingSoon: true, paramsSchema: z.record(z.unknown()) },
  { tool: "x.spaces", implemented: false, comingSoon: true, paramsSchema: z.record(z.unknown()) },
  { tool: "x.communities", implemented: false, comingSoon: true, paramsSchema: z.record(z.unknown()) },
] as const;

export type ExtractionTool = (typeof extractionTools)[number]["tool"];

export function getExtractionTool(tool: string) {
  return extractionTools.find((entry) => entry.tool === tool);
}

export function mapToolToLegacyKind(tool: string): "search_results" | "user_tweets" {
  if (
    tool === "x.search_results" ||
    tool === "x.tweet_replies" ||
    tool === "x.tweet_quotes" ||
    tool === "x.tweet_retweets" ||
    tool === "x.mentions" ||
    tool === "x.people_search" ||
    tool === "x.thread"
  ) {
    return "search_results";
  }
  return "user_tweets";
}
