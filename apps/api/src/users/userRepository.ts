// Database access for user records keyed by Discord user IDs.
// Message and permission services use this to look up or create the local user for an incoming Discord request.

import { prisma } from "../database/client.js";

export async function findUserByDiscordId(discordUserId: string) {
  return prisma.user.findUnique({
    where: { discordUserId }
  });
}

export async function createUser(discordUserId: string) {
  return prisma.user.create({
    data: { discordUserId }
  });
}

export async function findOrCreateUserByDiscordId(discordUserId: string) {
  return prisma.user.upsert({
    where: { discordUserId },
    update: {},
    create: { discordUserId }
  });
}