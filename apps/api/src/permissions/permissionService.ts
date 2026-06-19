// Permission rules for deciding which Discord users may use the v1 API.
// V1 only allows Discord user IDs listed in DISCORD_DEVELOPER_IDS.

// Parse the comma-separated allowlist into a Set for exact Discord user ID checks.
function getDeveloperDiscordIds() {
  return new Set(
    (process.env.DISCORD_DEVELOPER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function isDeveloperDiscordUser(discordUserId: string) {
  return getDeveloperDiscordIds().has(discordUserId.trim());
}

export function requireDeveloperDiscordUser(discordUserId: string) {
  if (!isDeveloperDiscordUser(discordUserId)) {
    throw new Error("Discord user is not allowed to use this API.");
  }
}