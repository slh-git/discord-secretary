// Re-export plugin contracts from shared so API code keeps a local import path.

export type {
  PluginContext,
  PluginDefinition,
  PluginLogger
} from "@discord-secretary/shared";
