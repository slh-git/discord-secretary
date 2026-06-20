// Shared TypeScript contracts for v1 bundled plugins.
// Defines what plugins receive at runtime (context) and what they must export (definition).



import type { AppEvent } from "@discord-secretary/shared";

import type { FastifyBaseLogger } from "fastify";

// PluginContext = what we GIVE to a plugin when it runs.
// v1 rule: plugins get logger + config only. No database access.
export interface PluginContext {
  // logger.info(), logger.error(), etc.
  logger: FastifyBaseLogger;

  // process.env values — read-only config for the plugin
  config: Record<string, string | undefined>;
}

// PluginDefinition = what a plugin file must export.
// Think of it as a "plugin contract".
export interface PluginDefinition {
  // Human-readable plugin name, used in logs
  name: string;

  // Map of event name → handler function
  // Example key: "message.received"
  events: Record<
    string,
    // When an event fires, the API calls this function.
    // The handler receives the event + the shared context.
    (event: AppEvent, ctx: PluginContext) => void | Promise<void>
  >;
}