// This file starts the Fastify API server and exposes the first v1 route: GET /health.

import Fastify from "fastify";
import { registerMessageRoutes } from "./api/messagesRoutes.js";
import { loadPlugins } from "./plugins/loadPlugins.js";

// Read server host/port from the environment, with defaults for local development.
const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? "3000");

// Create the Fastify app and enable built-in request/error logging.
const app = Fastify({
  logger: true
});

// Register a simple health endpoint so Docker, scripts, and humans can verify the API is running.
app.get("/health", async () => {
  return {
    ok: true,
    service: "discord-secretary-api"
  };
});

await registerMessageRoutes(app);

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