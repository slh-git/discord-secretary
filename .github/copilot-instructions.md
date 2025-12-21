# Discord User-Installable App - Copilot Instructions

## Architecture Overview

This is a Discord interaction bot using Express.js with webhook-based interactions (not Gateway/WebSocket). The bot demonstrates user-installable apps with context-aware commands that work across guilds, DMs, and group DMs.

**Core files:**
- `app.js` - Express server handling Discord webhook interactions at `/interactions`
- `commands.js` - Command definitions and registration script
- `game.js` - Fake game data (profiles, items) for demonstration
- `utils.js` - Discord API utilities, request verification, embed builders

## Critical Setup & Workflows

### Environment Requirements
- Node.js 20+ required (specified in `package.json` engines)
- Three env vars in `.env`: `APP_ID`, `DISCORD_TOKEN`, `PUBLIC_KEY`
- Uses ES modules (`"type": "module"` in package.json) - always use `import`/`export`

### Development Commands
```bash
npm run register  # Register slash commands with Discord API (run after command changes)
npm start         # Start production server
npm run dev       # Start with nodemon for hot reload
ngrok http 3000   # Expose local server - copy HTTPS URL to Discord's Interactions Endpoint URL
```

**Important:** After modifying commands in `commands.js`, you MUST run `npm run register` before they appear in Discord.

## Discord-Specific Patterns

### Interaction Request Flow
1. Discord sends POST to `/interactions` with signature headers
2. `VerifyDiscordRequest` middleware validates cryptographic signature using `PUBLIC_KEY`
3. `app.js` routes by `type` (PING, APPLICATION_COMMAND, MESSAGE_COMPONENT)
4. Return JSON response with `InteractionResponseType` (never send raw text)

### Command Definition Structure
Commands specify `integration_types` and `contexts`:
- `integration_types: [0]` = guild install only (e.g., `leaderboard` - needs guild members)
- `integration_types: [1]` = user install only (e.g., `profile` - personal data)
- `integration_types: [0, 1]` = works for both (e.g., `wiki`)
- `contexts: [0, 1, 2]` = where usable (guild, DM, group DM)

Example from `commands.js`:
```javascript
const WIKI_COMMAND = {
  name: 'wiki',
  type: 1,
  description: 'Lookup information in wiki',
  options: [/* choices from game.js */],
  integration_types: [0, 1],  // Both guild and user install
  contexts: [0, 1, 2],         // Usable everywhere
};
```

### Response Patterns

**Ephemeral responses** (only visible to command user):
```javascript
data: { 
  flags: 64,  // Makes response ephemeral
  content: 'Only you can see this'
}
```

**Embeds** (rich formatted messages):
Use `createPlayerEmbed()` from `utils.js` as template. Always include `type: 'rich'` and color as hex (e.g., `0x968b9f`).

**Components** (buttons):
```javascript
components: [{
  type: 1,  // Action row
  components: [{
    type: 2,          // Button
    label: 'Click me',
    custom_id: 'btn_id',  // For MESSAGE_COMPONENT interactions
    style: 2          // 2=secondary, 5=link (requires url field)
  }]
}]
```

### Context-Aware Behavior
Check `req.body.context` to determine interaction origin:
- `context === 1` = DM with bot → show full profile immediately
- `context !== 1` = guild/group → show ephemeral with share button

See `profile` command in `app.js` for implementation example.

## API Utilities

### Making Discord API Requests
Use `DiscordRequest(endpoint, options)` from `utils.js`:
- Automatically adds bot token and headers
- Endpoint is relative to `https://discord.com/api/v10/`
- Throws on non-OK responses
- Example: `DiscordRequest('guilds/${guildId}/members?limit=5', { method: 'GET' })`

### Registering Commands
`InstallGlobalCommands(appId, commands)` uses bulk overwrite endpoint - completely replaces existing commands with provided array.

## Project Conventions

- **No database:** All data is fake/hardcoded in `game.js` for demonstration
- **Fake leaderboard:** Uses `guilds/${guildId}/members` endpoint (requires Server Members Intent)
- **No error handling UI:** Failed API calls log to console but don't inform users
- **Module pattern:** Each file exports specific functions; no classes or complex state
- **Security:** ALWAYS verify Discord signature via `VerifyDiscordRequest` - this prevents request spoofing

## Common Tasks

**Adding a new command:**
1. Define command object in `commands.js` with proper `integration_types`/`contexts`
2. Add to `ALL_COMMANDS` array
3. Run `npm run register`
4. Add handler in `app.js` under `APPLICATION_COMMAND` switch

**Handling button clicks:**
Check `type === InteractionType.MESSAGE_COMPONENT` and match `data.custom_id` to button's `custom_id`. Each button needs a unique `custom_id` to differentiate between multiple buttons:
```javascript
if (type === InteractionType.MESSAGE_COMPONENT) {
  const { custom_id } = data;
  
  if (custom_id === 'share_profile') {
    // Handle share profile button
  }
  
  if (custom_id === 'another_button') {
    // Handle different button
  }
}
```

**Testing locally:**
1. Start `ngrok http 3000` and copy HTTPS URL
2. Set Discord app's Interactions Endpoint URL to `https://<ngrok-url>/interactions`
3. Run `npm run dev` for auto-reload
4. Trigger commands in Discord - check terminal for request logs
