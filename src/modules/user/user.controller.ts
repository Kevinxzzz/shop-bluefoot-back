import type { NextFunction, Request, Response } from "express";
import { updateUserRoleSchema, updateProfileSchema } from "./user.schema.js";
import { listUsers, updateUserRole as updateUserRoleService, updateProfile as updateProfileService } from "./user.service.js";
import { AppError } from "../../shared/errors/AppError.js";
import { getProfile as getProfileService } from "./user.service.js";

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.enterpriseId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await listUsers(req.user.enterpriseId);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = updateUserRoleSchema.parse({
      params: req.params,
      body: req.body,
    });

    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await updateUserRoleService({
      userId: parsedData.params.id,
      role: parsedData.body.role,
      enterpriseId: req.user.enterpriseId,
      adminId: req.user.userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = updateProfileSchema.parse(req.body);

    if (!req.user?.userId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await updateProfileService(req.user.userId, parsedData);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await getProfileService(req.user.userId);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
