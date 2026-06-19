// Fastify routes for inbound Discord message requests.
// These routes handle HTTP details, then delegate message behavior to the service layer.

import type { FastifyInstance } from "fastify";
import type { CreateMessageRequest } from "@discord-secretary/shared";
import { createInboundMessage } from "../messages/messageService.js";

// Registers POST /api/messages for the Discord app.
// The route extracts the acting Discord user ID from headers, rejects missing identity, and saves the inbound DM through the message service.
export async function registerMessageRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateMessageRequest }>("/api/messages", async (request, reply) => {
    const discordUserId = request.headers["x-discord-user-id"];

    if (typeof discordUserId !== "string" || !discordUserId.trim()) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing Discord user id."
        }
      });
    }

    const message = await createInboundMessage(discordUserId, request.body);

    return reply.status(201).send(message);
  });
}