import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { DeleteObjectCommand, DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileTypeFromFile } from "file-type";

const allowedImageExts = ["jpg", "jpeg", "png", "webp"];
const allowedVideoExts = ["mp4", "webm", "mov", "m4v", "quicktime"];

export async function processProductMediaUpload(files: Express.Multer.File[], userId: string, enterpriseId: string) {
  try {
    if (!files || files.length === 0) {
      throw new AppError("Obrigatório pelo menos 1 arquivo", 400);
    }

    let videoCount = 0;
    let imageCount = 0;

    const validatedFiles = [];

    for (const file of files) {
      const detected = await fileTypeFromFile(file.path);
      if (!detected) {
        throw new AppError(`Não foi possível determinar o tipo do arquivo ${file.originalname}`, 400);
      }

      const isImage = allowedImageExts.includes(detected.ext);
      const isVideo = allowedVideoExts.includes(detected.ext);

      if (!isImage && !isVideo) {
         throw new AppError(`Tipo de arquivo não permitido: ${detected.ext}`, 400);
      }

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

      validatedFiles.push({
         ...file,
         detectedExt: detected.ext,
         detectedMime: detected.mime,
         type: isVideo ? "VIDEO" : "FOTO"
      });
    }

    const uploadPromises = validatedFiles.map(async (file) => {
       const key = `enterprise/${enterpriseId}/users/${userId}/products/temp/${randomUUID()}.${file.detectedExt}`;
       const fileStream = fs.createReadStream(file.path);
       
       await s3.send(new PutObjectCommand({
         Bucket: env.AWS_BUCKET_NAME!,
         Key: key,
         Body: fileStream,
         ContentType: file.detectedMime,
       }));
       
       // Force close the stream after upload to release the file lock (especially important on Windows)
       fileStream.destroy();

       return {
         url: `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`,
         key,
         type: file.type
       };
    });

    const results = await Promise.allSettled(uploadPromises);
    const hasError = results.some(r => r.status === "rejected");

    if (hasError) {
       const successfulKeys = results
         .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
         .map(r => r.value.key);
         
       if (successfulKeys.length > 0) {
          try {
             await s3.send(new DeleteObjectsCommand({
                Bucket: env.AWS_BUCKET_NAME!,
                Delete: { Objects: successfulKeys.map(k => ({ Key: k })) }
             }));
          } catch (cleanupErr) {
             console.error("Erro no rollback de uploads parciais no S3", cleanupErr);
          }
       }
       // We can log the first rejection reason for debugging
       const firstError = results.find(r => r.status === "rejected") as PromiseRejectedResult;
       console.error("S3 Upload Error:", firstError.reason);

       throw new AppError("Erro durante o upload para a nuvem. Processo cancelado.", 500);
    }

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map(r => r.value);

  } finally {
     if (files && files.length > 0) {
        await Promise.allSettled(files.map(async (f) => {
           if (f.path) {
              try {
                await fs.promises.unlink(f.path);
              } catch (e) {
                console.error(`Erro ao apagar arquivo temporario ${f.path}`, e);
              }
           }
        }));
     }
  }
}
