# API App

This workspace contains the Fastify API.

## Scripts

- `npm run dev --workspace=apps/api`
  Starts the API in watch mode. When files change, it restarts automatically.

- `npm run build --workspace=apps/api`
  Compiles TypeScript into `dist`.

- `npm run start --workspace=apps/api`
  Runs the compiled production build from `dist`.

- `npm run typecheck --workspace=apps/api`
  Checks TypeScript types without writing build output.

## Dependencies

- `fastify`
  The HTTP server framework used for the API.

- `@discord-secretary/shared`
  Shared request, response, error, and event types used across workspaces.

## Dev Dependencies

- `tsx`
  Runs TypeScript directly during local development.

## TypeScript Config

`apps/api/tsconfig.json` configures TypeScript for the API workspace.

It extends the root `tsconfig.json`, so the API uses the same strict TypeScript rules as the rest of the repo.

- `rootDir: "src"`
  Source files live in `apps/api/src`.

- `outDir: "dist"`
  Compiled JavaScript and type files go into `apps/api/dist`.

- `include: ["src/**/*.ts"]`
  TypeScript only checks `.ts` files inside the API `src` directory.

## Database Scripts

- `npm run db:generate --workspace=apps/api`
  Generates the Prisma Client from `database/schema.prisma`.

- `npm run db:migrate --workspace=apps/api`
  Creates and applies a local Prisma migration against PostgreSQL.

## Database Dependencies

- `@prisma/client`
  The generated runtime client used by API repositories to query PostgreSQL.

- `prisma`
  The CLI used to generate Prisma Client and manage database migrations.