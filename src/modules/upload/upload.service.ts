import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../../shared/config/s3.js";
import { env } from "../../shared/config/env.js";
import type { UploadImageProfileInput } from "./upload.schema.js";

export async function updateProfileImage(userId: string, data: UploadImageProfileInput) {
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

  await prisma.user.update({
    where: { id: userId },
    data: { 
      profileImageUrl: data.location,
      profileImageKey: data.key
    },
  });

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
