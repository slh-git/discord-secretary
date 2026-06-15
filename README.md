# Discord Secretary (v1)

Greenfield v1 rewrite: Discord DM → Fastify API → PostgreSQL → in-memory event bus → bundled plugins.

The Discord app is a thin API client. All business logic lives in the API.

## Stack

- TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM
- Docker Compose
- discord.js

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- A Discord bot application and token ([Discord Developer Portal](https://discord.com/developers/applications))

## Quick start

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your values (no real secrets in `.env.example`):

   | Variable | Purpose |
   | --- | --- |
   | `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal |
   | `DISCORD_SERVICE_API_KEY` | Shared secret between the Discord app and API (`Authorization: Bearer …`) |
   | `DISCORD_DEVELOPER_IDS` | Comma-separated Discord user snowflakes allowed to use the bot |
   | `DATABASE_URL` | PostgreSQL connection string |
   | `API_BASE_URL` | URL the Discord app uses to reach the API (use `http://api:3000` inside Compose) |

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start Postgres, API, and Discord app:

   ```bash
   docker compose up
   ```

   Or use the npm script:

   ```bash
   npm run docker:up
   ```

5. Apply database migrations (once the API workspace exposes them):

   ```bash
   npm run db:migrate
   ```

6. Verify the API is up:

   ```bash
   curl http://localhost:3000/health
   ```

## V1 API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/users/me` | Current user (from header) |
| `POST` | `/api/messages` | Save an inbound DM |

Auth (v1):

```text
Authorization: Bearer <DISCORD_SERVICE_API_KEY>
X-Discord-User-Id: <discord snowflake>
```

Errors:

```json
{ "error": { "code": "PERMISSION_DENIED", "message": "..." } }
```

## Repo layout

```text
apps/api/           Fastify API, services, repositories, event bus
apps/discord/       Thin Discord client — API calls only
packages/shared/    Shared DTOs, event types, error types
database/           Drizzle schema and migrations
plugins/installed/  Bundled v1 plugins
```

## Local development (without Docker)

Run Postgres yourself, point `DATABASE_URL` at it, then:

```bash
npm run dev:api
npm run dev:discord
```

## V1 done when

- `docker compose up` starts Postgres, API, and Discord app
- Migrations apply cleanly
- `GET /health` returns OK
- A Discord DM creates or resolves a user
- Non-developer users are rejected
- Valid DMs are saved to PostgreSQL
- `message.received` fires and the reference plugin handles it

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for v1 architecture, API contract, and done criteria.
