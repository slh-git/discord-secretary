// Database access for saved Discord DM messages.
// Message services use this to persist inbound messages after validation and permission checks.

import { prisma } from "../database/client.js";

export async function createMessageForUser(userId: string, content: string) {
  return prisma.message.create({
    data: {
      userId,
      content
    }
  });
}