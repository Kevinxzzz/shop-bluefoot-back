import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { s3 } from "../../shared/config/s3.js";
import { env } from "../../shared/config/env.js";
import type { UploadImageProfileInput } from "./upload.schema.js";

export async function updateProfileImage(
  userId: string,
  data: UploadImageProfileInput,
) {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profileImageUrl: true,
      profileImageKey: true,
    },
  });

  if (!currentUser) {
    throw new AppError("Usuário não encontrado", 404);
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        profileImageUrl: data.location,
        profileImageKey: data.key,
      },
    });
  } catch (error) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: env.AWS_BUCKET_NAME!,
        Key: data.key,
      });
      await s3.send(command);
    } catch (s3Error) {
      console.error("Failed to rollback newly uploaded profile image from S3:", s3Error);
    }
    throw error;
  }

  if (currentUser.profileImageKey) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: env.AWS_BUCKET_NAME!,
        Key: currentUser.profileImageKey,
      });
      await s3.send(command);
    } catch (error) {
      console.error("Failed to delete old profile image from S3:", error);
    }
  }

  return { url: data.location };
}

export async function processProductMediaUpload(files: (Express.Multer.File & { location?: string; key?: string })[]) {
  // Helpers
  const deleteUploadedFiles = async (filesToDelete: { key?: string }[]) => {
    const keys = filesToDelete.map(f => f.key).filter(Boolean) as string[];
    if (keys.length === 0) return;

    try {
      const command = new DeleteObjectsCommand({
        Bucket: env.AWS_BUCKET_NAME!,
        Delete: {
          Objects: keys.map(key => ({ Key: key })),
        },
      });
      await s3.send(command);
    } catch (error) {
      console.error("Failed to delete product media from S3 after error:", error);
    }
  };

  try {
    if (!files || files.length === 0) {
      throw new AppError("Obrigatório pelo menos 1 arquivo", 400);
    }

    let videoCount = 0;
    let imageCount = 0;

    for (const file of files) {
      const isVideo = file.mimetype.startsWith("video/");
      const isImage = file.mimetype.startsWith("image/");

      if (isVideo) videoCount++;
      if (isImage) imageCount++;

      // Max files limits per type
      if (videoCount > 1) {
        throw new AppError("Apenas 1 vídeo é permitido", 400);
      }
      if (imageCount > 3) {
        throw new AppError("No máximo 3 imagens são permitidas", 400);
      }

      // Size limits
      const fileSizeInMB = file.size / (1024 * 1024);
      if (isImage && fileSizeInMB > 5) {
        throw new AppError(`A imagem ${file.originalname} excede o limite de 5MB`, 400);
      }
      if (isVideo && fileSizeInMB > 20) {
        throw new AppError(`O vídeo ${file.originalname} excede o limite de 20MB`, 400);
      }
    }

    const processedFiles = files.map(file => ({
      url: file.location as string,
      key: file.key as string,
      type: file.mimetype.startsWith("video/") ? "VIDEO" : "FOTO",
    }));

    return processedFiles;
  } catch (error) {
    await deleteUploadedFiles(files);
    throw error;
  }
}
