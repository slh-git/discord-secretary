// Business logic for accepting inbound Discord DMs.
// This validates the message, checks the Discord user allowlist, resolves the local user, and saves the message.

import type { CreateMessageRequest, CreateMessageResponse } from "@discord-secretary/shared";
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

  return {
    id: message.id,
    userId: message.userId,
    content: message.content,
    createdAt: message.createdAt.toISOString()
  };
}