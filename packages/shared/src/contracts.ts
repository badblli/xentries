import { z } from "zod";

export const canonicalEventTypeSchema = z.enum([
  "tweet.new",
  "tweet.reply",
  "tweet.quote",
  "tweet.retweet",
  "follower.gained",
  "follower.lost",
]);

export const legacyEventTypeSchema = z.enum([
  "tweet.new",
  "mention.new",
  "reply.new",
  "user.tweet.new",
]);

export const eventTypeSchema = z.union([canonicalEventTypeSchema, legacyEventTypeSchema]);

export const legacyMonitorTypeSchema = z.enum(["keyword", "user", "mentions"]);
export const monitorKindSchema = z.enum(["account", "query", "tweet"]);
export const providerSchema = z.enum(["x", "reddit"]);

export const accountTargetSchema = z
  .object({
    username: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.username || value.userId), {
    message: "target.username or target.userId is required",
  });

export const queryTargetSchema = z.object({
  query: z.string().min(1),
});

export const tweetTargetSchema = z.object({
  tweetId: z.string().min(1),
});

export const monitorTargetSchema = z.union([accountTargetSchema, queryTargetSchema, tweetTargetSchema]);

export const eventPayloadSchema = z.object({
  tweetId: z.string(),
  text: z.string(),
  authorId: z.string(),
  authorUsername: z.string(),
  createdAt: z.string().datetime(),
  url: z.string().url(),
  metrics: z.object({
    likeCount: z.number().int().nonnegative(),
    retweetCount: z.number().int().nonnegative(),
    replyCount: z.number().int().nonnegative(),
  }),
});

export const gatewayEventSchema = z.object({
  eventVersion: z.literal(1),
  type: eventTypeSchema,
  provider: z.literal("x"),
  providerItemId: z.string(),
  monitorId: z.string(),
  customerId: z.string(),
  occurredAt: z.string().datetime(),
  payload: eventPayloadSchema,
});

export type EventType = z.infer<typeof eventTypeSchema>;
export type MonitorKind = z.infer<typeof monitorKindSchema>;
export type LegacyMonitorType = z.infer<typeof legacyMonitorTypeSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type EventPayload = z.infer<typeof eventPayloadSchema>;
export type GatewayEvent = z.infer<typeof gatewayEventSchema>;

export const createMonitorSchema = z.object({
  provider: providerSchema.default("x"),
  kind: monitorKindSchema,
  target: monitorTargetSchema,
  pollingIntervalSec: z.number().int().min(15).max(3600),
  eventTypes: z.array(canonicalEventTypeSchema).min(1),
  webhookId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const legacyCreateMonitorSchema = z.object({
  provider: providerSchema.default("x"),
  type: legacyMonitorTypeSchema,
  query: z.string().min(1),
  pollingIntervalSec: z.number().int().min(15).max(3600),
  eventTypes: z.array(eventTypeSchema).min(1),
  webhookId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const createWebhookSchema = z.object({
  url: z.string().url(),
  isActive: z.boolean().optional(),
});

export const updateWebhookSchema = z
  .object({
    url: z.string().url().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.url !== undefined || value.isActive !== undefined, {
    message: "At least one field must be provided",
  });

export const createExtractionSchema = z.object({
  kind: z.enum(["user_tweets", "search_results"]),
  params: z.record(z.unknown()),
  idempotencyKey: z.string().optional(),
});

export const extractionToolSchema = z.enum([
  "x.search_results",
  "x.tweet_replies",
  "x.tweet_quotes",
  "x.tweet_retweets",
  "x.user_followers",
  "x.user_following",
  "x.user_posts",
  "x.mentions",
  "x.people_search",
  "x.thread",
  "x.lists",
  "x.spaces",
  "x.communities",
]);

export const createExtractionRequestSchema = z.object({
  tool: extractionToolSchema,
  params: z.record(z.unknown()),
});

export const wsSubscribeSchema = z.object({
  action: z.literal("subscribe"),
  monitorId: z.string(),
});

export const wsUnsubscribeSchema = z.object({
  action: z.literal("unsubscribe"),
  monitorId: z.string(),
});

export const wsPingSchema = z.object({
  action: z.literal("ping"),
});

export const wsMessageSchema = z.union([wsSubscribeSchema, wsUnsubscribeSchema, wsPingSchema]);
export const wsSubscriptionSchema = wsSubscribeSchema;

export const accountSchema = z.object({
  plan: z.string(),
  usage: z.object({
    apiCalls: z.number().int().nonnegative(),
    extractionRows: z.number().int().nonnegative(),
    eventsDelivered: z.number().int().nonnegative(),
  }),
  locale: z.enum(["en", "tr"]),
});

export const patchAccountSchema = z.object({
  locale: z.enum(["en", "tr"]),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(64).default("default"),
});
