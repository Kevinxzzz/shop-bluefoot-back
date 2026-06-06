import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import type { CreateProductInput, UpdateProductInput } from "./product.schema.js";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/index.js";

// Módulos externos refatorados
import { moveProductMediaFiles, deleteProductMediaFiles } from "../upload/upload.service.js";
import { 
  getAuthorizedProduct,
  validateEnterpriseReadPermission,
  validateUserReadPermission 
} from "./product.authorization.js";
import { 
  validateKeepMediaIds, 
  calculateFinalMediaState, 
  resolveMainMedia 
} from "./product-media.rules.js";

export async function createProduct(
  userId: string,
  enterpriseId: string,
  data: CreateProductInput
) {
  const productId = randomUUID();

  // 1. Validar Categorias
  if (data.categoryIds && data.categoryIds.length > 0) {
    const categories = await prisma.category.findMany({
      where: {
        id: { in: data.categoryIds },
        enterpriseId,
        deletedAt: null,
      },
    });

    if (categories.length !== data.categoryIds.length) {
      throw new AppError("One or more categories are invalid.", 400);
    }
  }

  // 2. Validar Mídias (Segurança Multi-tenant e isMain)
  const expectedPrefix = `enterprise/${enterpriseId}/users/${userId}/products/temp/`;
  if (data.media && data.media.length > 0) {
    const medias = data.media;
    let mainCount = 0;
    let firstFotoIndex = -1;
    let i = 0;

    for (const media of medias) {
      if (!media.key.startsWith(expectedPrefix)) {
        throw new AppError("Invalid media.", 403);
      }

      if (media.type === "FOTO" && firstFotoIndex === -1) {
        firstFotoIndex = i;
      }

      if (media.isMain) {
        if (media.type === "VIDEO") {
          throw new AppError("Um vídeo não pode ser a mídia principal.", 400);
        }
        mainCount++;
      }
      i++;
    }

    if (mainCount > 1) {
      throw new AppError("Apenas uma mídia pode ser definida como principal.", 400);
    }

    if (mainCount === 0 && firstFotoIndex !== -1) {
      medias[firstFotoIndex]!.isMain = true;
    }
  }

  // 3. Copiar Mídias no S3 ANTES da transação
  const mediaRecords: Prisma.ProductMediaCreateManyInput[] = [];
  let movedKeys: string[] = [];
  let originalKeys: string[] = [];

  if (data.media && data.media.length > 0) {
    // moveProductMediaFiles handles rollback inside it if there's any partial failure
    const moved = await moveProductMediaFiles(data.media as any, enterpriseId, productId);
    
    movedKeys = moved.map(m => m.newKey);
    originalKeys = moved.map(m => m.originalKey);

    let index = 0;
    for (const m of moved) {
      mediaRecords.push({
        url: m.newUrl,
        key: m.newKey,
        type: m.type as any,
        isMain: m.isMain ?? false,
        order: index++,
        productId,
      });
    }
  }

  // 4. Executar Transação no Prisma
  try {
    const product = await prisma.$transaction(async (tx) => {
      // 4.1. Criar Produto
      const newProduct = await tx.product.create({
        data: {
          id: productId,
          name: data.name,
          description: data.description ?? null,
          price: data.price ?? null,
          userId,
          enterpriseId,
        },
      });

      // 4.2. Criar Relacionamentos de Categoria
      if (data.categoryIds && data.categoryIds.length > 0) {
        await tx.productCategory.createMany({
          data: data.categoryIds.map((categoryId) => ({
            productId: newProduct.id,
            categoryId,
          })),
        });
      }

      // 4.3. Salvar Mídias no DB
      if (mediaRecords.length > 0) {
        await tx.productMedia.createMany({
          data: mediaRecords,
        });
      }

      return newProduct;
    });

    // 5. Deletar os arquivos temporários APENAS após o sucesso da transação
    if (originalKeys.length > 0) {
      deleteProductMediaFiles(originalKeys).catch(() => {});
    }

    return product;
  } catch (error) {
    // 6. Se a transação falhar, remover as novas mídias do S3 para não deixar órfãos
    if (movedKeys.length > 0) {
      const { rollbackProductMediaFiles } = await import("../upload/upload.service.js");
      await rollbackProductMediaFiles(movedKeys);
    }
    throw error;
  }
}

export async function getEnterpriseProducts(
  enterpriseId: string,
  query: { page: number; limit: number },
  userRole: string
) {
  // Validate Role at service layer
  validateEnterpriseReadPermission(userRole);

  const skip = (query.page - 1) * query.limit;

  const [products, totalItems] = await Promise.all([
    prisma.product.findMany({
      where: { enterpriseId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
      include: {
        categories: true,
        media: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.product.count({
      where: { enterpriseId, deletedAt: null },
    }),
  ]);

  return {
    products,
    page: query.page,
    limit: query.limit,
    totalItems,
    totalPages: Math.ceil(totalItems / query.limit),
  };
}

export async function getUserProducts(
  enterpriseId: string,
  userId: string,
  query: { page: number; limit: number },
  currentUser: { userId: string; role: string }
) {
  // Validate Role at service layer
  validateUserReadPermission(userId, currentUser);

  const skip = (query.page - 1) * query.limit;

  const [products, totalItems] = await Promise.all([
    prisma.product.findMany({
      where: { enterpriseId, userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
      include: {
        categories: true,
        media: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.product.count({
      where: { enterpriseId, userId, deletedAt: null },
    }),
  ]);

  return {
    products,
    page: query.page,
    limit: query.limit,
    totalItems,
    totalPages: Math.ceil(totalItems / query.limit),
  };
}

export async function getPublicProductById(id: string) {
  const product = await prisma.product.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      countViews: true,
      categories: {
        select: {
          category: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
      media: {
        select: { id: true, url: true, type: true, isMain: true, order: true },
        orderBy: { order: "asc" as const },
      },
      user: {
        select: { id: true, name: true, contactLink: true, profileImageUrl: true },
      },
    },
  });

  if (!product) {
    throw new AppError("Produto não encontrado", 404);
  }

  return product;
}

export async function incrementProductView(id: string) {
  await prisma.product.update({
    where: { id },
    data: { countViews: { increment: 1 } },
  });
}

export async function updateProduct(
  id: string,
  user: { userId: string; role: string; enterpriseId: string },
  data: UpdateProductInput
) {
  await getAuthorizedProduct(id, user, "update");

  if (data.categoryIds && data.categoryIds.length > 0) {
    const categories = await prisma.category.findMany({
      where: {
        id: { in: data.categoryIds },
        enterpriseId: user.enterpriseId,
        deletedAt: null,
      },
    });

    if (categories.length !== data.categoryIds.length) {
      throw new AppError("Uma ou mais categorias são inválidas.", 400);
    }
  }

  const updatedProduct = await prisma.$transaction(async (tx) => {
    const dataToUpdate: Prisma.ProductUpdateInput = {};
    if (data.name !== undefined) dataToUpdate.name = data.name;
    if (data.description !== undefined) dataToUpdate.description = data.description;
    if (data.price !== undefined) dataToUpdate.price = data.price;

    await tx.product.update({
      where: { id },
      data: dataToUpdate,
    });

    if (data.categoryIds) {
      await tx.productCategory.deleteMany({
        where: { productId: id },
      });
      await tx.productCategory.createMany({
        data: data.categoryIds.map((categoryId) => ({
          productId: id,
          categoryId,
        })),
      });
    }

    return tx.product.findUnique({
      where: { id },
      include: { categories: true, media: true },
    });
  });

  return updatedProduct;
}

export async function updateProductMedia(
  id: string,
  user: { userId: string; role: string; enterpriseId: string },
  data: { keepMediaIds: string[] },
  newFiles: Array<{ url: string; key: string; type: "FOTO" | "VIDEO" }>
) {
  const product = await getAuthorizedProduct(id, user, "update");

  const currentMedias = product.media;
  const currentMediaMap = new Map(currentMedias.map((m) => [m.id, m as any]));
  
  validateKeepMediaIds(data.keepMediaIds, currentMediaMap);

  const { mainPhotoKept, firstKeptPhotoId } = calculateFinalMediaState(
    data.keepMediaIds,
    currentMediaMap,
    newFiles as any
  );

  const mediaRecordsToInsert: Prisma.ProductMediaCreateManyInput[] = [];
  let movedKeys: string[] = [];
  let originalKeys: string[] = [];
  let firstNewPhotoKey: string | null = null;
  let orderIndex = data.keepMediaIds.length;
  
  if (newFiles.length > 0) {
    const moved = await moveProductMediaFiles(newFiles as any, user.enterpriseId, id);
    movedKeys = moved.map(m => m.newKey);
    originalKeys = moved.map(m => m.originalKey);

    for (const file of moved) {
      if (file.type === "FOTO" && !firstNewPhotoKey) {
        firstNewPhotoKey = file.newKey;
      }
      mediaRecordsToInsert.push({
        url: file.newUrl,
        key: file.newKey,
        type: file.type as any,
        isMain: false,
        order: orderIndex++,
        productId: id,
      });
    }
  }

  const newMainPhotoId = resolveMainMedia(
    mainPhotoKept,
    firstKeptPhotoId,
    firstNewPhotoKey,
    mediaRecordsToInsert
  );

  const mediaToDelete = currentMedias.filter((m) => !data.keepMediaIds.includes(m.id));

  try {
    await prisma.$transaction(async (tx) => {
      if (mediaToDelete.length > 0) {
        await tx.productMedia.deleteMany({
          where: { id: { in: mediaToDelete.map(m => m.id) } },
        });
      }

      if (newMainPhotoId) {
        if (currentMediaMap.has(newMainPhotoId)) {
          await tx.productMedia.update({
            where: { id: newMainPhotoId },
            data: { isMain: true },
          });
        }
      }

      if (mediaRecordsToInsert.length > 0) {
        await tx.productMedia.createMany({
          data: mediaRecordsToInsert,
        });
      }
    });

    if (mediaToDelete.length > 0) {
      deleteProductMediaFiles(mediaToDelete.map(m => m.key)).catch(() => {});
    }

    if (originalKeys.length > 0) {
      deleteProductMediaFiles(originalKeys).catch(() => {});
    }

    return prisma.product.findUnique({
      where: { id },
      include: { media: true },
    });
  } catch (error) {
    if (movedKeys.length > 0) {
      const { rollbackProductMediaFiles } = await import("../upload/upload.service.js");
      await rollbackProductMediaFiles(movedKeys);
    }
    throw error;
  }
}

export async function deleteProduct(
  id: string,
  user: { userId: string; role: string; enterpriseId: string }
) {
  const product = await getAuthorizedProduct(id, user, "delete");
  const mediaKeys = product.media.map((m) => m.key);

  await prisma.product.delete({
    where: { id },
  });

  if (mediaKeys.length > 0) {
    deleteProductMediaFiles(mediaKeys).catch(() => {});
  }
}
