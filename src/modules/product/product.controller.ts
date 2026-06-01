import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import { createProductSchema } from "./product.schema.js";
import { createProduct } from "./product.service.js";

export const postProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId || !req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }

    const parsedData = createProductSchema.parse(req.body);

    const product = await createProduct(
      req.user.userId,
      req.user.enterpriseId,
      parsedData
    );

    return res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};
