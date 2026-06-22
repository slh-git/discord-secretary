// Fastify routes for "who is the current Discord user?" requests.
// GET /api/users/me resolves (or creates) the local user record for the Discord snowflake in X-Discord-User-Id.
// The Discord app uses this to confirm the API knows about a user before sending messages.

import type { FastifyInstance } from "fastify";
import { requireDeveloperDiscordUser } from "../permissions/permissionService.js";
import { resolveDiscordUser } from "../users/userService.js";

// Pull the raw token out of: Authorization: Bearer <DISCORD_SERVICE_API_KEY>
// Returns null when the header is missing or not in Bearer format.
function extractBearerToken(authorizationHeader: string | undefined) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  // Case-insensitive "Bearer" prefix, then capture everything after it.
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

// Compare the request's service key to the one configured on the API.
// v1 rule: only the Discord app should know DISCORD_SERVICE_API_KEY.
function isValidServiceKey(providedKey: string | null) {
  const expectedKey = process.env.DISCORD_SERVICE_API_KEY?.trim();

  // Fail closed: if the server has no key configured, reject everyone.
  if (!expectedKey || !providedKey) {
    return false;
  }

  return providedKey === expectedKey;
}

// Registers GET /api/users/me on the Fastify app.
// Called once from server.ts during startup, same pattern as registerMessageRoutes().
export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users/me", async (request, reply) => {
    // Step 1 — service auth: is this request from our Discord app?
    const bearerToken = extractBearerToken(request.headers.authorization);

    if (!isValidServiceKey(bearerToken)) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing service API key."
        }
      });
    }

    // Step 2 — acting user: which Discord user is this request about?
    const discordUserId = request.headers["x-discord-user-id"];

    if (typeof discordUserId !== "string" || !discordUserId.trim()) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing Discord user id."
        }
      });
    }

    // Step 3 — v1 allowlist: only configured developer Discord IDs may use the API.
    // requireDeveloperDiscordUser throws if the user is not allowed.
    // (Error mapping to JSON is a follow-up polish item.)
    requireDeveloperDiscordUser(discordUserId);

    // Step 4 — resolve or create the local User row for this Discord snowflake.
    const user = await resolveDiscordUser(discordUserId);

    // Step 5 — return a stable JSON shape the Discord app can rely on.
    // Dates become ISO strings so JSON serialization is predictable.
    return reply.status(200).send({
      id: user.id,
      discordUserId: user.discordUserId,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    });
  });
}