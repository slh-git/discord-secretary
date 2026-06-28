// Boots the Fastify API server: health check, message/user routes, plugin loading, then listen.
// Also maps service-layer thrown errors into the v1 { error: { code, message } } JSON shape.

import Fastify from "fastify";
import type { ApiErrorResponse } from "@discord-secretary/shared";
import { registerMessageRoutes } from "./api/messagesRoutes.js";
import { registerUserRoutes } from "./api/usersRoutes.js";
import { loadPlugins } from "./plugins/loadPlugins.js";

// Read server host/port from the environment, with defaults for local development.
const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? "3000");

// Turn a thrown Error from services into an HTTP status + v1 error body.
// v1 services throw plain Error with stable messages; routes do not catch them.
function mapThrownError(error: unknown): { statusCode: number; body: ApiErrorResponse } {
  const message = error instanceof Error ? error.message : "";

  if (message === "Discord user is not allowed to use this API.") {
    return {
      statusCode: 403,
      body: {
        error: {
          code: "PERMISSION_DENIED",
          message
        }
      }
    };
  }

  if (message === "Message content is required.") {
    return {
      statusCode: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message
        }
      }
    };
  }

  // Unknown failures: generic client message; details stay in server logs only.
  return {
    statusCode: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred."
      }
    }
  };
}

// Create the Fastify app and enable built-in request/error logging.
const app = Fastify({
  logger: true
});

// Catch errors bubbling out of route handlers and return the v1 error contract.
app.setErrorHandler((error, request, reply) => {
  const { statusCode, body } = mapThrownError(error);

  // Log the real error server-side; body.message may be sanitized for 500s.
  request.log.error({ err: error, statusCode }, "request failed");

  return reply.status(statusCode).send(body);
});

// Register a simple health endpoint so Docker, scripts, and humans can verify the API is running.
app.get("/health", async () => {
  return {
    ok: true,
    service: "discord-secretary-api"
  };
});

await registerMessageRoutes(app);
// Register user identity routes (GET /api/users/me) for Discord app user resolution.
await registerUserRoutes(app);

// Load bundled plugins before listening so message.received handlers are ready for the first request.
await loadPlugins({
  logger: app.log,
  config: process.env
});

// Start listening for HTTP requests, and fail loudly if startup crashes.
try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
