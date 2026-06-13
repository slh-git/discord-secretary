# Rewrite Start Instructions

Goal: start a greenfield v1 rewrite in this repo. Keep v1 small: Discord DM -> API -> PostgreSQL -> event -> reference plugin.

## 1. Git First

```bash
git status
git switch dev
git pull --ff-only
git switch -c rewrite/v1-core
git status
```

If `git status` shows user work, stop and ask before deleting or overwriting files.

## 2. Delete Old Bot Template

Delete old implementation files after the branch exists:

```bash
rm -rf src config lang .github Dockerfile docker-compose.yml pm2.json
```

Keep:

```text
docs/
README.md
package.json
package-lock.json
tsconfig.json
.gitignore
```

Then rewrite package/config files instead of preserving template behavior.

## 3. Create V1 Structure

```bash
mkdir -p apps/api/src/{api,users,permissions,messages,plugins,events,database}
mkdir -p apps/discord/src
mkdir -p packages/shared/src
mkdir -p database/migrations
mkdir -p plugins/installed/reference-plugin
```

Target layout:

```text
apps/api/        Fastify API, services, repositories, event bus
apps/discord/    thin Discord client, calls API only
packages/shared/ shared DTOs, event types, error types
database/        Drizzle schema and migrations
plugins/         bundled v1 plugins
```

## 4. Create Config Files

Create or replace:

```text
package.json        npm workspaces and scripts
tsconfig.json       shared TypeScript config
docker-compose.yml  api + postgres + discord
.env.example        no real secrets
README.md           v1 setup only
```

Use this stack only:

```text
TypeScript, Fastify, PostgreSQL, Drizzle, Docker Compose, discord.js
```

Do not add Redis, queues, web app, mobile app, AI, jobs, OAuth, microservices, or plugin marketplace in v1.

## 5. Build In This Order

1. Shared event and error types in `packages/shared`.
2. Fastify API with `GET /health`.
3. Drizzle database connection, schema, and migrations.
4. `users` module: resolve or create user by Discord snowflake.
5. `permissions` module: allow configured developer users only.
6. `messages` module: validate, permission check, save inbound DM.
7. In-memory event bus in API.
8. Emit `message.received` after message save.
9. Reference plugin subscribed to `message.received`.
10. Discord app that listens for DMs and calls `POST /api/messages`.

## 6. V1 API Contract

```text
GET  /health
GET  /api/users/me
POST /api/messages
```

Auth for v1:

```text
Authorization: Bearer <DISCORD_SERVICE_API_KEY>
X-Discord-User-Id: <discord snowflake>
```

Error shape:

```json
{ "error": { "code": "PERMISSION_DENIED", "message": "..." } }
```

## 7. Rules For Agents

- Put business logic in API services only.
- Discord app must not import database, repositories, or domain services.
- Repositories do database access only; services own validation and transactions.
- Plugins do not access the database in v1.
- Events are facts named in past tense, for example `message.received`.
- Keep every step runnable before adding the next one.
- Prefer deleting template code over adapting it.

## 8. Done For First Version

V1 is done when:

- `docker compose up` starts Postgres, API, and Discord app.
- Migrations apply cleanly.
- `GET /health` returns OK.
- Discord DM creates or resolves a user.
- Non-developer Discord users are rejected.
- Valid DM is saved to PostgreSQL.
- `message.received` fires.
- Reference plugin handles the event.
- Discord app remains a thin API adapter.
