# Discord Bot Development Guide

**Product vision:** See [VISION.md](../VISION.md) — natural-language calendar adds (e.g. "add calendar dentist Wednesday 3 pm").

## Project Architecture

This is a **discord.js v14** bot using TypeScript with ESM modules. Two entry points serve different purposes:

- **`src/start-bot.ts`**: Single bot instance for development/testing
- **`src/start-manager.ts`**: Production mode with ShardingManager for scaling (2500+ servers) + Express API server on port 3001

The manager mode is required for OAuth integrations (like Google Calendar) because it provides HTTP endpoints for OAuth callbacks.

## Core Patterns

### Command Registration Flow

1. Create command class implementing `Command` interface in `src/commands/chat/`, `/message/`, or `/user/`
2. Add metadata to corresponding metadata file (e.g., `src/commands/chat/metadata.ts`)
3. Import and add to commands array in `src/start-bot.ts`
4. Run `npm run commands:register` to sync with Discord API

**Example command structure:**
```typescript
export class MyCommand implements Command {
    public names = [Lang.getRef('chatCommands.mycommand', Language.Default)];
    public deferType = CommandDeferType.PUBLIC;  // or HIDDEN or NONE
    public requireClientPerms: PermissionsString[] = [];
    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        await InteractionUtils.send(intr, Lang.getEmbed('displayEmbeds.myResponse', data.lang));
    }
}
```

### Event Handler Pipeline

All Discord events flow through specialized handlers in `src/events/`:
- Commands → `CommandHandler` (with built-in rate limiting from config)
- Buttons → `ButtonHandler` 
- Reactions → `ReactionHandler`
- Messages → `MessageHandler` (includes trigger system)

Handlers are registered in `Bot` class ([src/models/bot.ts](src/models/bot.ts)) via `EventHandler` interface.

### Configuration System

Config is loaded from a **single module** [src/config.ts](src/config.ts), which reads `config/config.json` and overlays **environment variables** for secrets. Use `import Config from './config.js'` (or the appropriate relative path). Do not `require('../config/config.json')` elsewhere.

- **Config files** (copy from `.example.json`): `config.json`, `debug.json`, `bot-sites.json`
- **Env vars** (optional; override config): `DISCORD_BOT_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### Multi-Language Support

All user-facing text lives in `lang/` directory:
- `lang.common.json`: Shared across all languages (colors, URLs)
- `lang.en-US.json`, `lang.en-GB.json`: Language-specific strings
- Access via `Lang` service methods:
  - `Lang.getEmbed(location, langCode)`: Returns Discord EmbedBuilder
  - `Lang.getRef(location, langCode)`: Returns string
  - `Lang.getCom(location)`: Returns common value

Structure uses dot notation: `"chatCommands.gcalendar": "gcalendar"`

## Critical Workflows

### Build and Test
```bash
npm run build          # Compile TS to dist/ (required before running)
npm test              # Run vitest tests once
npm run test:watch    # Watch mode for TDD
npm run test:coverage # Generate coverage report
```

### Running Locally
```bash
npm start                  # Single instance (start-bot)
npm run start:manager      # Sharding + API server (start-manager)
npm run start:pm2         # PM2 process manager
```

### Command Management
```bash
npm run commands:view      # List registered commands
npm run commands:register  # Register/update commands with Discord (run after changes)
npm run commands:clear     # Remove all commands
```

### Code Quality
```bash
npm run lint              # ESLint check
npm run lint:fix          # Auto-fix linting issues
npm run format:fix        # Prettier auto-format
```

## TypeScript Configuration

- **Module System**: ES2022 (ESM) - use `.js` extensions in imports even for `.ts` files
- **Strict Mode**: OFF in main `tsconfig.json`. Incremental migration: use `tsconfig.strict.json` and see [docs/TYPESCRIPT_STRICT_MIGRATION.md](docs/TYPESCRIPT_STRICT_MIGRATION.md).
- **Decorators**: Enabled for `class-transformer` and `class-validator` validation
- **Output**: Compiles `src/` to `dist/` with source maps (test files `**/*.test.ts` excluded)

## Key Anti-Patterns to Avoid

1. **Don't bypass InteractionUtils**: Always use `InteractionUtils.send()`, `.deferReply()`, etc. instead of raw discord.js methods. They handle edge cases like unknown interactions and message deletion.

2. **Rate limiting is configured, not coded**: Command cooldowns use `discord.js-rate-limiter` via `Command.cooldown` property, not custom logic.

3. **Jobs run on manager only**: Scheduled tasks in `src/jobs/` (using `node-schedule`) run in `start-manager.ts`, not `start-bot.ts`, to avoid duplicate execution when sharded.

4. **Absolute imports required**: Use full relative paths with `.js` extension: `import { Lang } from '../../services/index.js'`

## Testing Conventions

Test files live in `tests/` (mirroring `src/`) and in `src/**/*.test.ts`. Use builder pattern for mocking Discord entities:

```typescript
import { userBuilder, guildBuilder, commandInteractionBuilder } from '../builders/discord-builders.js';

const user = userBuilder().withId('123').withUsername('testuser').build();
const interaction = commandInteractionBuilder().withUser(user).build();
```

Builders use `vitest-mock-extended` for deep mocking. See [tests/builders/discord-builders.ts](tests/builders/discord-builders.ts) for available builders.

## Scaling Architecture

- **Sharding**: Automatic when 2500+ guilds. `ShardingManager` spawns multiple bot processes.
- **Clustering**: Multi-machine deployment via Master API (external system, see README)
- **Caching**: Configure limits in `config.json` → `client.caches` to control memory usage

## OAuth and Google Calendar

- **Shared auth**: [src/services/gcalendar-auth.ts](src/services/gcalendar-auth.ts) — `SCOPES` (read + create events), `TOKEN_PATH`, `createOAuth2Client`, `getAuthenticatedClient`, `saveTokens`. Use this instead of duplicating OAuth client setup.
- **Calendar API**: [src/services/calendar-service.ts](src/services/calendar-service.ts) — `insertEvent(calendarId, { summary, start, end? })` for creating events.
- **Flow**: User runs `/gcalendar` or says "add calendar …"; bot uses tokens in `config/google-tokens.json` (or prompts auth). OAuth callback is in [OAuthController](src/controllers/oauth-controller.ts) (manager mode only). See [docs/GOOGLE_CALENDAR_INTEGRATION.md](docs/GOOGLE_CALENDAR_INTEGRATION.md) if present.

## Common File Locations

- Add commands: `src/commands/chat/`, `message/`, `user/`
- Add triggers (e.g. "add calendar …"): `src/triggers/`
- Add buttons: `src/buttons/`
- Add scheduled jobs: `src/jobs/`
- Add API endpoints: `src/controllers/`
- Config loader: `src/config.ts` (single source; env overlay)
- Utility functions: `src/utils/`
- Service layer: `src/services/` (including `gcalendar-auth`, `calendar-service`)
- Type definitions: `src/models/`
- Language strings: `lang/`
