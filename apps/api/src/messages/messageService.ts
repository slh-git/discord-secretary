// Business logic for accepting inbound Discord DMs.
// This validates the message, checks the Discord user allowlist, resolves the local user, saves the message, and emits message.received.

import { randomUUID } from "node:crypto";
import type {
  CreateMessageRequest,
  CreateMessageResponse,
  MessageReceivedEvent
} from "@discord-secretary/shared";
import { emitEvent } from "../events/eventBus.js";
import { requireDeveloperDiscordUser } from "../permissions/permissionService.js";
import { resolveDiscordUser } from "../users/userService.js";
import { createMessageForUser } from "./messageRepository.js";

export async function createInboundMessage(
  discordUserId: string,
  request: CreateMessageRequest
): Promise<CreateMessageResponse> {
  const content = request.content.trim();

  if (!content) {
    throw new Error("Message content is required.");
  }

  requireDeveloperDiscordUser(discordUserId);

  const user = await resolveDiscordUser(discordUserId);
  const message = await createMessageForUser(user.id, content);
  const createdAt = message.createdAt.toISOString();

  const event: MessageReceivedEvent = {
    id: randomUUID(),
    type: "message.received",
    timestamp: Date.now(),
    source: "api.messages",
    payload: {
      messageId: message.id,
      userId: message.userId,
      discordUserId: user.discordUserId,
      content: message.content,
      receivedAt: createdAt
    }
  };

  await emitEvent(event);

  return {
    id: message.id,
    userId: message.userId,
    content: message.content,
    createdAt
  };
}