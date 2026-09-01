import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const rootEnvPath = path.resolve(process.cwd(), "..", ".env.local");
if (fs.existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
