import { prisma } from "../../shared/database/prisma.js";

/**
 * Checks if a category has any active products linked to it.
 * Active products are those where `deletedAt` is null.
 * 
 * @param categoryId - The UUID of the category
 * @returns boolean - true if there are active products, false otherwise
 */
export async function hasActiveProductsLinked(categoryId: string): Promise<boolean> {
  const linkedProductsCount = await prisma.productCategory.count({
    where: {
      categoryId,
      product: {
        deletedAt: null,
      },
    },
  });

  return linkedProductsCount > 0;
}
