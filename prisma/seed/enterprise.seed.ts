import { prisma } from "../../src/shared/database/prisma.js";
import bcrypt from "bcryptjs";

export async function seedEnterprise() {
  const adminRole = await prisma.userRole.findUnique({
    where: { role: "ADMIN" },
  });

  if (!adminRole) {
    throw new Error("Admin role not found. Make sure to run seedRoles first.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: "dev@gmail.com" },
  });

  if (existingUser) {
    console.log("✅ Dev user already exists, skipping enterprise seed");
    return;
  }

  const randomCnpj = `${Math.floor(Math.random() * 90 + 10)}.${Math.floor(
    Math.random() * 900 + 100
  )}.${Math.floor(Math.random() * 900 + 100)}/0001-${Math.floor(
    Math.random() * 90 + 10
  )}`;

  const randomPhone = `119${Math.floor(Math.random() * 90000000 + 10000000)}`;
  const hashedPassword = await bcrypt.hash("123456", 10);

  await prisma.enterprise.create({
    data: {
      cnpj: randomCnpj,
      name: "dev",
      phoneNumber: randomPhone,
      users: {
        create: {
          name: "dev",
          email: "dev@gmail.com",
          password: hashedPassword,
          roleId: adminRole.id,
        },
      },
    },
  });

  console.log("✅ Enterprise seeded successfully");
}
