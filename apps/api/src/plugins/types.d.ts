import type { AppEvent } from "@discord-secretary/shared";
import type { FastifyBaseLogger } from "fastify";
export interface PluginContext {
    logger: FastifyBaseLogger;
    config: Record<string, string | undefined>;
}
export interface PluginDefinition {
    name: string;
    events: Record<string, (event: AppEvent, ctx: PluginContext) => void | Promise<void>>;
}
//# sourceMappingURL=types.d.ts.map