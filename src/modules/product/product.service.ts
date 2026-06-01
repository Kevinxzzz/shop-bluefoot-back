import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { s3 } from "../../shared/config/s3.js";
import { env } from "../../shared/config/env.js";
import { CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { CreateProductInput } from "./product.schema.js";
import { randomUUID } from "node:crypto";

async function rollbackMovedMedia(keys: string[]) {
  if (keys.length === 0) return;
  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: env.AWS_BUCKET_NAME!,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
        },
      })
    );
  } catch (error) {
    console.error("Failed to rollback moved media from S3:", error);
  }
}

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
  const mediaRecords: any[] = [];
  const movedMediaKeys: string[] = [];
  const originalMediaKeys: string[] = [];

  if (data.media && data.media.length > 0) {
    try {
      let index = 0;
      for (const m of data.media) {
        const fileName = m.key.split("/").pop();
        const newKey = `enterprise/${enterpriseId}/products/${productId}/${fileName}`;
        const newUrl = m.url.replace(m.key, newKey);

        // Copy no S3
        await s3.send(
          new CopyObjectCommand({
            Bucket: env.AWS_BUCKET_NAME!,
            CopySource: `${env.AWS_BUCKET_NAME}/${m.key}`,
            Key: newKey,
          })
        );
        movedMediaKeys.push(newKey);
        originalMediaKeys.push(m.key);

        mediaRecords.push({
          url: newUrl,
          key: newKey,
          type: m.type,
          isMain: m.isMain ?? false,
          order: index,
          productId,
        });

        index++;
      }
    } catch (error) {
      // Se falhou durante a movimentação, tentar apagar os que já foram movidos
      await rollbackMovedMedia(movedMediaKeys);
      console.error("S3 error during move:", error);
      throw new AppError("Erro ao processar mídias no provedor de armazenamento.", 500);
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
    if (originalMediaKeys.length > 0) {
      try {
        await Promise.all(
          originalMediaKeys.map((key) =>
            s3.send(
              new DeleteObjectCommand({
                Bucket: env.AWS_BUCKET_NAME!,
                Key: key,
              })
            )
          )
        );
      } catch (deleteError) {
        console.error("Failed to delete temp files after successful product creation:", deleteError);
        // Não lançamos erro aqui pois o produto já foi criado com sucesso.
        // Fica a cargo da rotina de limpeza limpar esses arquivos residuais.
      }
    }

    return product;
  } catch (error) {
    // 6. Se a transação falhar, remover as novas mídias do S3 para não deixar órfãos
    // E os arquivos temporários originais são preservados
    await rollbackMovedMedia(movedMediaKeys);
    throw error;
  }
}
