import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { role: true, enterprise: true },
  });
  console.log("USERS:", JSON.stringify(users, null, 2));

  const enterprises = await prisma.enterprise.findMany();
  console.log("ENTERPRISES:", JSON.stringify(enterprises, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
