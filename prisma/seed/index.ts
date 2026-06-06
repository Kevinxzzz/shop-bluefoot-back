import { prisma } from "../../src/shared/database/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Starting database seeding...");

  // 1. Upsert Roles
  const adminRole = await prisma.userRole.upsert({
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

  // 2. Setup dev enterprise data
  const randomCnpj = `${Math.floor(Math.random() * 90 + 10)}.${Math.floor(
    Math.random() * 900 + 100
  )}.${Math.floor(Math.random() * 900 + 100)}/0001-${Math.floor(
    Math.random() * 90 + 10
  )}`;

  const randomPhone = `119${Math.floor(Math.random() * 90000000 + 10000000)}`;
  const hashedPassword = await bcrypt.hash("123456", 10);

  // 3. Upsert Enterprise
  let enterprise = await prisma.enterprise.findFirst({
    where: { name: "dev" }
  });

  if (!enterprise) {
    enterprise = await prisma.enterprise.create({
      data: {
        cnpj: randomCnpj,
        name: "dev",
        phoneNumber: randomPhone,
      },
    });
  }

  // 4. Upsert Dev User ensuring relation to Enterprise and Admin Role
  await prisma.user.upsert({
    where: { email: "dev@gmail.com" },
    update: {
      roleId: adminRole.id,
      enterpriseId: enterprise.id,
      password: hashedPassword,
    },
    create: {
      name: "dev",
      email: "dev@gmail.com",
      password: hashedPassword,
      roleId: adminRole.id,
      enterpriseId: enterprise.id,
    },
  });

  console.log("✅ Enterprise and Dev user seeded successfully");
  console.log("Database seeding completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
