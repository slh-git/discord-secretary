// Thin Discord client for v1: listens for DMs and forwards them to the API.
// No database or domain logic — only discord.js + fetch to POST /api/messages.

import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import type { CreateMessageRequest } from "@discord-secretary/shared";

// Read required env vars once at startup; missing values fail fast.
const discordBotToken = process.env.DISCORD_BOT_TOKEN?.trim();
const apiBaseUrl = process.env.API_BASE_URL?.trim()?.replace(/\/$/, "");
const serviceApiKey = process.env.DISCORD_SERVICE_API_KEY?.trim();

if (!discordBotToken) {
  throw new Error("DISCORD_BOT_TOKEN is required.");
}

if (!apiBaseUrl) {
  throw new Error("API_BASE_URL is required.");
}

if (!serviceApiKey) {
  throw new Error("DISCORD_SERVICE_API_KEY is required.");
}

// Send an inbound DM to the API as the acting Discord user.
async function postInboundMessage(discordUserId: string, content: string) {
  const body: CreateMessageRequest = { content };

  const response = await fetch(`${apiBaseUrl}/api/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceApiKey}`,
      "X-Discord-User-Id": discordUserId
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Create a discord.js client that only cares about direct messages.
const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel] // Required so DM channels resolve for message events.
});

// Log in and confirm the bot is online.
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Discord client ready as ${readyClient.user.tag}`);
});

// Forward each DM to the API; ignore bot messages and empty content.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    return;
  }

  // v1 only handles DMs, not guild channel messages.
  if (!message.channel.isDMBased()) {
    return;
  }

  const content = message.content.trim();

  if (!content) {
    return;
  }

  try {
    await postInboundMessage(message.author.id, content);
    console.log(`Forwarded DM from ${message.author.id}`);
  } catch (error) {
    console.error("Failed to forward DM to API:", error);
  }
});

// Start the bot.
await client.login(discordBotToken);