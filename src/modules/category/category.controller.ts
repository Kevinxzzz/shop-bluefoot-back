import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import { createCategorySchema, queryCategorySchema, updateCategorySchema } from "./category.schema.js";
import { createCategory, deleteCategoryPermanently, listCategories, archiveCategory, restoreCategory, updateCategory } from "./category.service.js";
import { z } from "zod";

export const createCategoryController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = createCategorySchema.parse(req.body);

    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const category = await createCategory(req.user.enterpriseId, parsedData);
    return res.status(201).json(category);
  } catch (error) {
    next(error);
  }
};

export const getCategoriesController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedQuery = queryCategorySchema.parse(req.query);

    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await listCategories(req.user.enterpriseId, parsedQuery);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateCategoryController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = z.string().uuid().parse(req.params.id);
    const parsedData = updateCategorySchema.parse(req.body);

    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const category = await updateCategory(categoryId, req.user.enterpriseId, parsedData);
    return res.status(200).json(category);
  } catch (error) {
    next(error);
  }
};

export const archiveCategoryController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = z.string().uuid().parse(req.params.id);

    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await archiveCategory(categoryId, req.user.enterpriseId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const restoreCategoryController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = z.string().uuid().parse(req.params.id);

    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await restoreCategory(categoryId, req.user.enterpriseId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteCategoryPermanentlyController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = z.string().uuid().parse(req.params.id);

    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await deleteCategoryPermanently(categoryId, req.user.enterpriseId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
