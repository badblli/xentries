export type JsonSchema = Record<string, unknown>;

export const mcpToolSchemas: Record<string, JsonSchema> = {
  list_monitors: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  create_monitor: {
    type: "object",
    additionalProperties: false,
    required: ["provider", "kind", "target", "eventTypes", "pollingIntervalSec", "isActive"],
    properties: {
      provider: { type: "string", enum: ["x"] },
      kind: { type: "string", enum: ["account", "query", "tweet"] },
      target: { type: "object" },
      eventTypes: { type: "array", items: { type: "string" } },
      pollingIntervalSec: { type: "integer", minimum: 15, maximum: 3600 },
      webhookId: { type: "string" },
      isActive: { type: "boolean" },
    },
  },
  update_monitor: {
    type: "object",
    additionalProperties: false,
    required: ["id", "patch"],
    properties: {
      id: { type: "string" },
      patch: { type: "object" },
    },
  },
  list_events: {
    type: "object",
    additionalProperties: false,
    properties: {
      cursor: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      monitorId: { type: "string" },
      type: { type: "string" },
      since: { type: "string", format: "date-time" },
      until: { type: "string", format: "date-time" },
    },
  },
  search_tweets: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1 },
      sinceId: { type: "string" },
      maxResults: { type: "integer", minimum: 10, maximum: 100 },
    },
  },
  create_extraction: {
    type: "object",
    additionalProperties: false,
    required: ["tool", "params"],
    properties: {
      tool: { type: "string" },
      params: { type: "object" },
    },
  },
  get_extraction: {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: {
      id: { type: "string" },
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 5000 },
    },
  },
  export_extraction: {
    type: "object",
    additionalProperties: false,
    required: ["id", "format"],
    properties: {
      id: { type: "string" },
      format: { type: "string", enum: ["json", "csv", "xlsx", "md"] },
    },
  },
  create_webhook: {
    type: "object",
    additionalProperties: false,
    required: ["url"],
    properties: {
      url: { type: "string", format: "uri" },
      isActive: { type: "boolean" },
    },
  },
  list_webhooks: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
};

export const mcpToolNames = Object.keys(mcpToolSchemas);
