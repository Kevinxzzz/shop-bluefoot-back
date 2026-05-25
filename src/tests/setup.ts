import { beforeAll, afterAll } from "@jest/globals";
import "dotenv/config";
import { prisma } from "../shared/database/prisma.js";

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
  const deleteUsers = prisma.user.deleteMany();
  const deleteEnterprises = prisma.enterprise.deleteMany();
  const deleteTokens = prisma.enterpriseInviteToken.deleteMany();

  await prisma.$transaction([deleteTokens, deleteUsers, deleteEnterprises]);
  await prisma.$disconnect();
});
