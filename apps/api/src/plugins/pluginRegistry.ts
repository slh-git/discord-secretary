// Wires bundled plugins into the in-memory event bus at startup.
// Wraps each handler in try/catch so a plugin failure cannot crash the API or block other subscribers.


// Import onEvent from our in-memory event bus.
// onEvent lets us say: "when X happens, run this function".
import { onEvent } from "../events/eventBus.js";

// Import the types we just defined.
import type { PluginContext, PluginDefinition } from "./types.js";

// registerPlugin = take one plugin and subscribe all its handlers.
export function registerPlugin(plugin: PluginDefinition, ctx: PluginContext) {
  // plugin.events looks like:
  // {
  //   "message.received": async (event, ctx) => { ... }
  // }
  //
  // Object.entries turns that into pairs:
  // [["message.received", handlerFn], ...]
  for (const [eventType, handler] of Object.entries(plugin.events)) {

    // For each event type, subscribe a wrapper function to the bus.
    onEvent(eventType, async (event) => {
      try {
        // Call the plugin's actual handler.
        // We pass the event from the bus + the shared context.
        await handler(event, ctx);

      } catch (error) {
        // IMPORTANT v1 rule: plugin failure must NOT crash the API.
        // If the plugin throws, we log it and move on.
        ctx.logger.error(
          {
            err: error,           // the actual error object
            plugin: plugin.name,  // which plugin failed
            eventType             // which event it was handling
          },
          "plugin handler failed"
        );
      }
    });
  }
}