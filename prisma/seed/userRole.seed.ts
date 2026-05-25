import { prisma } from "../../src/shared/database/prisma.js";

export async function seedRoles() {
  await prisma.userRole.upsert({
    where: { role: "ADMIN" },
    update: {},
    create: {
      role: "ADMIN",
      description: "Administrador da Empresa",
    },
  });

  await prisma.userRole.upsert({
    where: { role: "SELLER" },
    update: {},
    create: {
      role: "SELLER",
      description: "Vendedor da Empresa",
    },
  });

  console.log("✅ Roles seeded successfully");
}
