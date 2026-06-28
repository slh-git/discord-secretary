/**
 * Error codes the API is allowed to return.
 */
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "PERMISSION_DENIED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

/**
 * Standard error response shape returned by API endpoints.
 *
 * Example:
 * { "error": { "code": "PERMISSION_DENIED", "message": "..." } }
 */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/**
 * Generic event envelope used for all application events.
 */
export interface AppEvent<TPayload = unknown> {
  id: string;
  type: string;
  timestamp: number;
  source: string;
  payload: TPayload;
}

/**
 * Payload emitted after a Discord DM has been received and saved.
 */
export interface MessageReceivedPayload {
  messageId: string;
  userId: string;
  discordUserId: string;
  content: string;
  receivedAt: string;
}

/**
 * Event emitted when a Discord DM is saved.
 */
export type MessageReceivedEvent = AppEvent<MessageReceivedPayload> & {
  type: "message.received";
};

/**
 * Request body sent by the Discord app to POST /api/messages.
 */
export interface CreateMessageRequest {
  content: string;
}

/**
 * Response returned after the API saves a message.
 */
export interface CreateMessageResponse {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
}

/**
 * Minimal logger surface plugins receive at runtime.
 * Fastify's logger satisfies this structurally — no fastify dependency in shared.
 */
export interface PluginLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  info(msg: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  error(msg: string): void;
}

/**
 * Runtime context passed to every plugin handler (logger + env config only).
 */
export interface PluginContext {
  logger: PluginLogger;
  config: Record<string, string | undefined>;
}

/**
 * Default export shape every bundled plugin must provide.
 */
export interface PluginDefinition {
  name: string;
  events: Record<
    string,
    (event: AppEvent, ctx: PluginContext) => void | Promise<void>
  >;
}
