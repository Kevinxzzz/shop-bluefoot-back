import type { NextFunction, Request, Response } from "express";
import { updateUserRoleSchema, updateProfileSchema, getPublicUserByIdSchema } from "./user.schema.js";
import { 
  listUsers, 
  updateUserRole as updateUserRoleService, 
  updateProfile as updateProfileService,
  getProfile as getProfileService,
  getEnterpriseUsersPublic,
  getPublicUserById
} from "./user.service.js";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../shared/config/env.js";

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

export const getPublicUsersHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!env.ID_ENTERPRISE_MARTINS) {
      throw new AppError(
        "A loja pública não está configurada corretamente (Falta ID_ENTERPRISE_MARTINS).",
        500,
      );
    }

    const result = await getEnterpriseUsersPublic(env.ID_ENTERPRISE_MARTINS);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getPublicUserByIdHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = getPublicUserByIdSchema.parse({
      params: req.params,
    });

    if (!env.ID_ENTERPRISE_MARTINS) {
      throw new AppError(
        "A loja pública não está configurada corretamente (Falta ID_ENTERPRISE_MARTINS).",
        500,
      );
    }

    const result = await getPublicUserById(parsedData.params.id, env.ID_ENTERPRISE_MARTINS);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

