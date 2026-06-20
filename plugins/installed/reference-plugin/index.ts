// Import the event types from shared.
// MessageReceivedPayload tells us what's inside message.received.
import type { AppEvent, MessageReceivedPayload } from "@discord-secretary/shared";

// Import PluginContext so TypeScript knows what ctx contains.
// (Path may vary depending on your folder layout.)
import type { PluginContext } from "../../../apps/api/src/plugins/types.js";

// Every plugin exports a default object matching PluginDefinition.
export default {
  // Name used in logs when this plugin runs or fails.
  name: "reference-plugin",

  // events = "I care about these event names"
  events: {
    // When a message is saved, messageService emits "message.received".
    // This function runs automatically because loadPlugins registered it.
    "message.received": async (
      event: AppEvent<MessageReceivedPayload>,
      ctx: PluginContext
    ) => {
      // Log that we received the event.
      // This is enough for v1 — proves the event pipeline works.
      ctx.logger.info(
        {
          messageId: event.payload.messageId,       // saved message id
          discordUserId: event.payload.discordUserId // who sent the DM
        },
        "reference-plugin handled message.received"
      );

      // In a real plugin you might:
      // - send a notification
      // - call an external API
      // - schedule a reminder
      //
      // v1 rule: do NOT touch the database here.
    }
  }
};