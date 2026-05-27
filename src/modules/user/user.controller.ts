import type { NextFunction, Request, Response } from "express";
import { generateInviteSchema, registerUserSchema } from "./user.schema.js";
import { generateInviteToken, registerUserWithInvite, listUsers } from "./user.service.js";
import { AppError } from "../../shared/errors/AppError.js";

export const createInvite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = generateInviteSchema.parse(req.body);

    if (!req.user?.enterpriseId || !req.user?.userId) {
      throw new AppError("Usuário não autenticado corretamente", 401);
    }

    const result = await generateInviteToken(
      req.user.enterpriseId,
      req.user.userId,
      parsedData
    );

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = registerUserSchema.parse(req.body);

    const result = await registerUserWithInvite(parsedData);

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

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

