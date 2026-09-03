import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import { createProductSchema } from "./product.schema.js";
import { createProduct } from "./product.service.js";
import {
  getProductsQuerySchema,
  updateProductSchema,
  updateProductMediaSchema,
} from "./product.schema.js";
import {
  getEnterpriseProductsPublic,
  getUserProducts,
  getPublicProductById,
  incrementProductView,
  updateProduct,
  updateProductMedia,
  deleteProduct,
} from "./product.service.js";
import { processProductMediaUpload } from "../upload/upload.service.js";
import { env } from "../../shared/config/env.js";

export const postProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.userId || !req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }

    const parsedData = createProductSchema.parse(req.body);

    const product = await createProduct(
      req.user.userId,
      req.user.enterpriseId,
      parsedData,
    );

    return res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

export const getPublicProductsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = getProductsQuerySchema.parse(req.query);

    if (!env.ID_ENTERPRISE_MARTINS) {
      throw new AppError(
        "A loja pública não está configurada corretamente (Falta ID_ENTERPRISE_MARTINS).",
        500,
      );
    }

    const result = await getEnterpriseProductsPublic(
      query,
      env.ID_ENTERPRISE_MARTINS,
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getEnterpriseProductsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }

    const query = getProductsQuerySchema.parse(req.query);
    const result = await getEnterpriseProductsPublic(query, req.user.enterpriseId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getUserProductsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }

    const { userId } = req.params;
    if (!userId || typeof userId !== "string")
      throw new AppError("ID de usuário ausente", 400);

    if (req.user.role === "SELLER" && req.user.userId !== userId) {
      throw new AppError(
        "Acesso negado para listar produtos de outro usuário",
        403,
      );
    }

    const query = getProductsQuerySchema.parse(req.query);
    const result = await getUserProducts(req.user.enterpriseId, userId, query, {
      userId: req.user.userId,
      role: req.user.role,
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getProductByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== "string")
      throw new AppError("ID do produto ausente", 400);

    const product = await getPublicProductById(id);

    const isAuthenticated = !!req.user;

    if (!isAuthenticated) {
      const cookieName = `product_view_${id}`;
      const hasViewed = !!req.cookies?.[cookieName];

      if (!hasViewed) {
        await incrementProductView(id);

        res.cookie(cookieName, "1", {
          maxAge: 24 * 60 * 60 * 1000,
          httpOnly: true,
          sameSite: "lax",
        });
      }
    }

    return res.status(200).json(product);
  } catch (error) {
    next(error);
  }
};

export const updateProductHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado ou sem empresa", 401);
    }

    const { id } = req.params;
    if (!id || typeof id !== "string")
      throw new AppError("ID do produto ausente", 400);

    const parsedData = updateProductSchema.parse(req.body);

    const updatedProduct = await updateProduct(
      id,
      {
        userId: req.user.userId,
        role: req.user.role,
        enterpriseId: req.user.enterpriseId,
      },
      parsedData,
    );

    return res.status(200).json(updatedProduct);
  } catch (error) {
    next(error);
  }
};

export const updateProductMediaHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado", 401);
    }

    const { id } = req.params;
    if (!id || typeof id !== "string")
      throw new AppError("ID do produto ausente", 400);

    const parsedBody = updateProductMediaSchema.parse(req.body);
    const files = (req.files as Express.Multer.File[]) || [];

    const newFiles =
      files.length > 0
        ? await processProductMediaUpload(
          files,
          req.user.userId,
          req.user.enterpriseId,
        )
        : [];

    const result = await updateProductMedia(
      id,
      {
        userId: req.user.userId,
        role: req.user.role,
        enterpriseId: req.user.enterpriseId,
      },
      parsedBody,
      newFiles,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteProductHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado", 401);
    }

    const { id } = req.params;
    if (!id || typeof id !== "string")
      throw new AppError("ID do produto ausente", 400);

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
