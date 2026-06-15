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
