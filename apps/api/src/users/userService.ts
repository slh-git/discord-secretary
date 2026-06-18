// User business logic for resolving the local user behind a Discord request.
// Routes and message services use this instead of reading or creating users directly.

import { findOrCreateUserByDiscordId } from "./userRepository.js";

export async function resolveDiscordUser(discordUserId: string) {
  const trimmedDiscordUserId = discordUserId.trim();

  if (!trimmedDiscordUserId) {
    throw new Error("Discord user ID is required.");
  }

  return findOrCreateUserByDiscordId(trimmedDiscordUserId);
}