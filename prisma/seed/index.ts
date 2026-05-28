import { prisma } from "../../src/shared/database/prisma.js";
import { seedRoles } from "./userRole.seed.js";
import { seedEnterprise } from "./enterprise.seed.js";

async function main() {
  console.log("Starting database seeding...");
  await seedRoles();
  await seedEnterprise();
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
