import type { NextFunction, Request, Response } from "express";
import { loginSchema } from "./auth.schema.js";
import { LoggingIn } from "./auth.service.js";

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = loginSchema.parse(req.body);
    
    const result = await LoggingIn(parsedData);
    
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};