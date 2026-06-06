import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { z } from "zod";
import { createCategorySchema, queryCategorySchema, updateCategorySchema } from "./category.schema.js";
import { hasActiveProductsLinked } from "./category.utils.js";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
type QueryCategoryInput = z.infer<typeof queryCategorySchema>;

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s-]/g, "") // Remove caracteres especiais
    .replace(/[\s_-]+/g, "-") // Troca espaços e underlines por hífen
    .replace(/^-+|-+$/g, ""); // Remove hífens do começo e fim
}

export async function createCategory(enterpriseId: string, { name }: CreateCategoryInput) {
  const slug = generateSlug(name);

  const existingCategory = await prisma.category.findUnique({
    where: {
      enterpriseId_slug: {
        enterpriseId,
        slug,
      },
    },
  });

  // Soft delete logic: if it exists and is deleted, we might want to let them recreate or restore?
  // Since we use soft delete, let's just check if there's any active category with this slug.
  // Actually, wait: @@unique([enterpriseId, slug]) prevents creating a new one if it's soft deleted.
  // So we must handle soft deleted categories. If it exists but is soft deleted, we restore it and update the name.
  // If it exists and is NOT soft deleted, we return error.

  if (existingCategory) {
    if (!existingCategory.deletedAt) {
      throw new AppError("Categoria já existe", 400);
    } else {
      // Restore category
      return prisma.category.update({
        where: { id: existingCategory.id },
        data: { name, deletedAt: null },
      });
    }
  }

  return prisma.category.create({
    data: {
      name,
      slug,
      enterpriseId,
    },
  });
}

export async function listCategories(enterpriseId: string, query: QueryCategoryInput) {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;

  const whereClause: any = { enterpriseId };
  if (status === "ACTIVE") {
    whereClause.deletedAt = null;
  } else if (status === "DELETED") {
    whereClause.deletedAt = { not: null };
  }

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where: whereClause,
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        deletedAt: true,
        _count: {
          select: {
            products: {
              where: {
                product: { deletedAt: null }
              }
            }
          }
        }
      },
      orderBy: { name: "asc" },
    }),
    prisma.category.count({
      where: whereClause,
    }),
  ]);

  const formattedCategories = categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    status: cat.deletedAt ? "DELETED" : "ACTIVE",
    deletedAt: cat.deletedAt,
    productsCount: cat._count.products
  }));

  return {
    data: formattedCategories,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateCategory(id: string, enterpriseId: string, { name }: UpdateCategoryInput) {
  const category = await prisma.category.findFirst({
    where: { id, enterpriseId },
  });

  if (!category) {
    throw new AppError("Categoria não encontrada", 404);
  }

  if (category.deletedAt) {
    throw new AppError("Categoria está na lixeira", 400);
  }

  const dataToUpdate: any = {};

  if (name && name !== category.name) {
    dataToUpdate.name = name;
    const newSlug = generateSlug(name);
    
    if (newSlug !== category.slug) {
      const existingSlug = await prisma.category.findUnique({
        where: {
          enterpriseId_slug: {
            enterpriseId,
            slug: newSlug,
          },
        },
      });

      if (existingSlug && !existingSlug.deletedAt) {
         throw new AppError("Categoria já existe", 400);
      } else if (existingSlug && existingSlug.deletedAt) {
         // If a soft-deleted category with the new slug exists, we can't easily update this category's slug to that one because of the unique constraint.
         // Let's just throw for simplicity, or we could hard delete the soft-deleted one. Throwing is safer.
         throw new AppError("Categoria já existe", 400);
      }
      dataToUpdate.slug = newSlug;
    }
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return category; // Nothing to update
  }

  return prisma.category.update({
    where: { id },
    data: dataToUpdate,
  });
}

export async function archiveCategory(id: string, enterpriseId: string) {
  const category = await prisma.category.findFirst({
    where: { id, enterpriseId, deletedAt: null },
  });

  if (!category) {
    throw new AppError("Categoria não encontrada", 404);
  }

  const hasLinked = await hasActiveProductsLinked(id);

  if (hasLinked) {
    throw new AppError("Categoria possui produtos vinculados", 409);
  }

  // Soft delete
  await prisma.category.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return { message: "Categoria arquivada com sucesso" };
}

export async function restoreCategory(id: string, enterpriseId: string) {
  const category = await prisma.category.findFirst({
    where: { id, enterpriseId },
  });

  if (!category) {
    throw new AppError("Categoria não encontrada", 404);
  }

  if (!category.deletedAt) {
    throw new AppError("A categoria não está arquivada", 400);
  }

  // Validar se existe categoria ATIVA com o mesmo slug
  const activeSlugConflict = await prisma.category.findFirst({
    where: {
      slug: category.slug,
      enterpriseId,
      deletedAt: null,
    },
  });

  if (activeSlugConflict) {
    throw new AppError("Não é possível restaurar: já existe uma categoria ativa com este nome/slug.", 409);
  }

  await prisma.category.update({
    where: { id },
    data: { deletedAt: null },
  });

  return { message: "Categoria restaurada com sucesso" };
}

export async function deleteCategoryPermanently(id: string, enterpriseId: string) {
  const category = await prisma.category.findFirst({
    where: { id, enterpriseId },
  });

  if (!category) {
    throw new AppError("Categoria não encontrada", 404);
  }

  if (!category.deletedAt) {
    throw new AppError("A categoria deve estar arquivada para ser excluída permanentemente", 400);
  }

  const hasLinked = await hasActiveProductsLinked(id);

  if (hasLinked) {
    throw new AppError("Categoria possui produtos vinculados", 409);
  }

  await prisma.category.delete({
    where: { id },
  });

  return { message: "Categoria removida permanentemente" };
}
