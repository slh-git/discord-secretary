# Rewrite Handoff (minimal)

**Greenfield rewrite** — not the current repo. One backend owns all business logic; clients are thin API adapters.

```text
Clients (Discord/Web/Mobile) → Fastify API → Services → PostgreSQL
                                      Services → Event Bus → Plugins
```

**Rule:** logic in services only. Clients/plugins never touch DB. Services emit events; plugins subscribe (services don't know plugins exist).

---

## Stack

TypeScript · Fastify · PostgreSQL · Drizzle · Docker Compose · discord.js (v1 client)  
Later: Next.js, React Native, Redis (v2+)

**Avoid v1:** microservices, Kafka/RabbitMQ, CQRS, command bus, event sourcing, K8s, plugin marketplace.

---

## Repo (monorepo)

```text
apps/api/src/     api/ users/ permissions/ messages/ plugins/ events/ database/
apps/discord/     thin client — API calls only, no domain logic
packages/shared/  Event, DTOs, error types
```

v2: `apps/web/`, `apps/mobile/`

---

## Domains

**v1:** `users` `permissions` `messages` `plugins`  
**Later:** `tasks` `calendar` `ai` `workflows` `knowledge` — add only when needed.  
(Task examples elsewhere = pattern only; **messages** is the v1 domain.)

---

## V1 slice

**Ship:** DM-only Discord bot → `POST /api/messages` → persist → `message.received` → 1 reference plugin.  
**Not v1:** tasks, calendar, ai, web, mobile, Redis, background jobs.

**Flow:** DM → `apps/discord` → auth → rate limit → MessageService (validate, permission check, save) → emit event → plugin.

**Done when:** migrations applied; `/health` + `/api/messages` work; Discord user auto-provisioned; non-developers rejected; plugin handles `message.received`; discord app has zero DB/domain logic; README + `docker compose up` documented.

---

## Auth (v1)

```text
Authorization: Bearer <DISCORD_SERVICE_API_KEY>
X-Discord-User-Id: <snowflake>
```

Service key = discord app. Header = acting user (resolve/create in `users/`). No user JWT in v1.  
v2+: JWT via Discord OAuth (same user records). Keys env-only.

---

## API

Prefix `/api`. Middleware: **Auth → Rate limit → Router → Service**.

| Route | Purpose |
|-------|---------|
| `GET /health` | Liveness |
| `POST /api/messages` | Inbound DM |
| `GET /api/users/me` | From `X-Discord-User-Id` |

JSON only. Errors: `{ "error": { "code": "PERMISSION_DENIED", "message": "..." } }`. No versioning until breaking change needed.

---

## Data

`Service → Repository → PostgreSQL`. Drizzle migrations in `database/migrations/`. Services own transactions/rules. Plugins: no DB/repos in v1 — use event payload.

---

## Events

Naming: `domain.action` past tense (`message.received`, `user.created`).

```ts
interface Event<T = unknown> {
  id: string; type: string; timestamp: number; source: string; payload: T;
}
```

Service pattern: save → `eventBus.emit(type, event)`. Facts, not commands.

---

## Plugins

Loaded at API startup: scan `plugins/installed/` → `registry.register` → `eventBus.on` per handler.

```ts
export default {
  name: "reference-plugin",
  events: { "message.received": async (event, ctx) => { /* ctx: logger, config only */ } },
}
```

Plugin failure must not crash bus. Bundled allowlist in v1; capability permissions v4.

---

## Deploy (v1)

Docker Compose on one VPS: `api`, `postgres`, `discord`.

```text
DATABASE_URL  DISCORD_BOT_TOKEN  DISCORD_SERVICE_API_KEY
API_BASE_URL  DISCORD_DEVELOPER_IDS
```

---

## Phases

1. monorepo + api + discord + users/permissions/messages + event bus + 1 plugin  
2. web + mobile + Redis  
3. notifications + scheduling + background jobs  
4. advanced plugins + external integrations + distributed workers

**More detail:** `docs/Potential_Rewrite_Architecture.md` (diagrams, sequences).
