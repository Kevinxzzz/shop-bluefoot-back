import type { NextFunction, Request, Response } from "express";
import { loginSchema, registerSellerSchema } from "./auth.schema.js";
import { LoggingIn, registerSellerWithToken } from "./auth.service.js";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const parsedData = loginSchema.parse(req.body);

    const result = await LoggingIn(parsedData);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    return res.status(200).json(req.user);
  } catch (error) {
    next(error);
  }
};

export const registerSellerHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const parsedData = registerSellerSchema.parse(req.body);
    const result = await registerSellerWithToken(parsedData);
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
