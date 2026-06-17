// This file creates the Prisma database client used by API repositories.
// The API should not create a new database connection in every service or route. Instead, it imports one shared client from this file.


import { PrismaClient } from "@prisma/client";

// Reuse one Prisma client during development so file reloads do not create extra database connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Create the Prisma client, or reuse the existing development client if one already exists.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

// Store the client globally outside production to avoid connection churn during watch-mode reloads.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}