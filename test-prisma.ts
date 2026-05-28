import { prisma } from "./src/shared/database/prisma.js";

async function main() {
  try {
    const res = await prisma.category.findMany({
      select: { id: true, deletedAt: true }
    });
    console.log("Success findMany", res);
  } catch (err) {
    console.error("Error findMany:", err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
