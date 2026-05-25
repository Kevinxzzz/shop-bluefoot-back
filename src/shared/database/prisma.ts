import { PrismaClient } from "../../generated/prisma/index.js";

export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
  __internal: {
    engine: "library"
  }
} as any);
