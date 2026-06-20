// Loads bundled plugins when the API starts and registers them on the event bus.
// V1 loads plugins from plugins/installed/ at runtime so they stay outside the API rootDir.

// existsSync checks whether a file exists on disk before we pick .js vs .ts.
import { existsSync } from "node:fs";
// path.resolve turns a relative plugin folder into an absolute filesystem path.
import path from "node:path";
// pathToFileURL converts that path into a URL import() can load in ESM.
import { pathToFileURL } from "node:url";

// registerPlugin wires one plugin's event handlers onto the in-memory bus.
import { registerPlugin } from "./pluginRegistry.js";
// PluginContext = logger + config passed to every plugin handler.
// PluginDefinition = the default export shape every plugin file must provide.
import type { PluginContext, PluginDefinition } from "./types.js";

// Resolve the on-disk entry file for a bundled plugin folder.
// relativePath is from this file's directory up to plugins/installed/<plugin-name>.
function resolveBundledPluginEntry(relativePath: string) {
  // import.meta.dirname = directory containing this compiled/source file.
  const pluginDir = path.resolve(import.meta.dirname, relativePath);
  const jsEntry = path.join(pluginDir, "index.js");

  // Production uses compiled .js; local dev with tsx loads the .ts source.
  return existsSync(jsEntry) ? jsEntry : path.join(pluginDir, "index.ts");
}

// Called once from server.ts before app.listen().
// ctx gives every plugin the same Fastify logger and environment config.
export async function loadPlugins(ctx: PluginContext) {
  // Path from apps/api/src/plugins/ up to repo-root plugins/installed/reference-plugin.
  const referencePluginPath = resolveBundledPluginEntry(
    "../../../../plugins/installed/reference-plugin"
  );

  // Dynamic import keeps plugins outside apps/api/src so TypeScript rootDir stays valid.
  // Static imports would pull plugin source into the API compile and fail typecheck.
  const { default: referencePlugin } = (await import(
    pathToFileURL(referencePluginPath).href
  )) as { default: PluginDefinition };

  // Subscribe the plugin's handlers (for example message.received) on the event bus.
  registerPlugin(referencePlugin, ctx);

  // Confirm startup wiring succeeded before the server accepts requests.
  ctx.logger.info({ plugin: referencePlugin.name }, "plugin registered");

  // Later, when you add more plugins:
  // const otherPluginPath = resolveBundledPluginEntry("../../../../plugins/installed/other-plugin");
  // const { default: otherPlugin } = await import(pathToFileURL(otherPluginPath).href);
  // registerPlugin(otherPlugin as PluginDefinition, ctx);
}
