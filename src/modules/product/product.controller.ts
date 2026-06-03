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

import {
  getProductsQuerySchema,
  updateProductSchema,
  updateProductMediaSchema
} from "./product.schema.js";

import {
  getEnterpriseProducts,
  getUserProducts,
  getProductById,
  updateProduct,
  updateProductMedia,
  deleteProduct
} from "./product.service.js";
import { processProductMediaUpload } from "../upload/upload.service.js";

export const getEnterpriseProductsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.enterpriseId || req.user.role !== "ADMIN") {
      throw new AppError("Acesso restrito para administradores", 403);
    }
    const query = getProductsQuerySchema.parse(req.query);
    const result = await getEnterpriseProducts(req.user.enterpriseId, query, req.user.role);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getUserProductsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }
    
    const { userId } = req.params;
    if (!userId || typeof userId !== "string") throw new AppError("ID de usuário ausente", 400);

    if (req.user.role === "SELLER" && req.user.userId !== userId) {
      throw new AppError("Acesso negado para listar produtos de outro usuário", 403);
    }

    const query = getProductsQuerySchema.parse(req.query);
    const result = await getUserProducts(req.user.enterpriseId, userId, query, {
      userId: req.user.userId,
      role: req.user.role
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getProductByIdHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }

    const { id } = req.params;
    if (!id || typeof id !== "string") throw new AppError("ID do produto ausente", 400);

    const product = await getProductById(id, {
      userId: req.user.userId,
      role: req.user.role,
      enterpriseId: req.user.enterpriseId,
    });
    
    return res.status(200).json(product);
  } catch (error) {
    next(error);
  }
};

export const updateProductHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }

    const { id } = req.params;
    if (!id || typeof id !== "string") throw new AppError("ID do produto ausente", 400);

    const parsedData = updateProductSchema.parse(req.body);

    const updatedProduct = await updateProduct(
      id,
      {
        userId: req.user.userId,
        role: req.user.role,
        enterpriseId: req.user.enterpriseId,
      },
      parsedData
    );

    return res.status(200).json(updatedProduct);
  } catch (error) {
    next(error);
  }
};

export const updateProductMediaHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado", 401);
    }

    const { id } = req.params;
    if (!id || typeof id !== "string") throw new AppError("ID do produto ausente", 400);

    const parsedBody = updateProductMediaSchema.parse(req.body);
    const files = req.files as Express.Multer.File[] || [];

    const newFiles = await processProductMediaUpload(files, req.user.userId, req.user.enterpriseId);

    const result = await updateProductMedia(
      id,
      {
        userId: req.user.userId,
        role: req.user.role,
        enterpriseId: req.user.enterpriseId,
      },
      parsedBody,
      newFiles
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteProductHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado", 401);
    }

    const { id } = req.params;
    if (!id || typeof id !== "string") throw new AppError("ID do produto ausente", 400);

    await deleteProduct(id, {
      userId: req.user.userId,
      role: req.user.role,
      enterpriseId: req.user.enterpriseId,
    });

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};
