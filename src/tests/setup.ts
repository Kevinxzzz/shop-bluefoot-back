import { beforeAll, afterAll } from "@jest/globals";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env.test"))
  ? path.resolve(process.cwd(), ".env.test")
  : path.resolve(process.cwd(), ".env");

dotenv.config({ path: envPath, quiet: true });
import { prisma, pool } from "../shared/database/prisma.js";

beforeAll(async () => {
  // Garantir que as roles existem antes de rodar os testes
  await prisma.userRole.upsert({
    where: { role: "ADMIN" },
    update: {},
    create: { role: "ADMIN", description: "Administrador da Empresa" },
  });

  await prisma.userRole.upsert({
    where: { role: "SELLER" },
    update: {},
    create: { role: "SELLER", description: "Vendedor da Empresa" },
  });
});

afterAll(async () => {
  // Safety guard: prevent accidental cleanup of non-test databases
  const databaseUrl = process.env.DATABASE_URL || "";
  if (
    process.env.NODE_ENV !== "test" ||
    !databaseUrl.includes("test")
  ) {
    throw new Error(
      "Database cleanup is allowed only on test databases. " +
      "Ensure NODE_ENV=test and DATABASE_URL points to a test database."
    );
  }

  const deleteProductMedia = prisma.productMedia.deleteMany();
  const deleteProductCategory = prisma.productCategory.deleteMany();
  const deleteProducts = prisma.product.deleteMany();
  const deleteUserTokens = prisma.userToken.deleteMany();
  const deleteInviteTokens = prisma.enterpriseInviteToken.deleteMany();
  const deleteCategories = prisma.category.deleteMany();
  const deleteUsers = prisma.user.deleteMany();
  const deleteEnterprises = prisma.enterprise.deleteMany();

  await prisma.$transaction([
    deleteProductMedia,
    deleteProductCategory,
    deleteProducts,
    deleteUserTokens,
    deleteInviteTokens,
    deleteCategories,
    deleteUsers,
    deleteEnterprises,
  ]);
  await prisma.$disconnect();
  await pool.end();
});
