import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import { uploadImageProfileSchema } from "./upload.schema.js";
import { updateProfileImage } from "./upload.service.js";

export const postUpload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      throw new AppError("Usuário não autenticado", 401);
    }

    const file = req.file as Express.Multer.File & { location?: string; key?: string };
    
    if (!file || !file.location || !file.key) {
      throw new AppError("Erro ao fazer upload da imagem", 400);
    }

    const parsedData = uploadImageProfileSchema.parse({
      location: file.location,
      key: file.key,
    });

    const result = await updateProfileImage(req.user.userId, parsedData);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};