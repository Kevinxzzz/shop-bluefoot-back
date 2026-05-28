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
});
