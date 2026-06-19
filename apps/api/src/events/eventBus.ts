// Small in-memory event bus for v1 application events.
// Services emit completed facts, and plugins subscribe to the event types they care about.

import type { AppEvent } from "@discord-secretary/shared";

type EventHandler<TPayload = unknown> = (event: AppEvent<TPayload>) => void | Promise<void>;

// Store event handlers by event type, for example "message.received".
const handlers = new Map<string, EventHandler[]>();

export function onEvent<TPayload>(type: string, handler: EventHandler<TPayload>) {
  // Keep any existing subscribers and add the new handler for this event type.
  const existingHandlers = handlers.get(type) ?? [];
  handlers.set(type, [...existingHandlers, handler as EventHandler]);
}

export async function emitEvent<TPayload>(event: AppEvent<TPayload>) {
  // Events with no subscribers are valid; they simply do not trigger any work.
  const eventHandlers = handlers.get(event.type) ?? [];

  // Run subscribers in order so async plugin handlers finish before emitEvent returns.
  for (const handler of eventHandlers) {
    await handler(event);
  }
}