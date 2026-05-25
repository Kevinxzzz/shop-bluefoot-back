import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";
import { env } from "../config/env.js";

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  enterpriseId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("Token JWT não informado", 401);
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    throw new AppError("Token JWT mal formatado", 401);
  }

  try {
    const secret = String(env.JWT_SECRET || "default_secret");
    const decoded = jwt.verify(token, secret) as unknown as TokenPayload;
    req.user = decoded;
    next();
  } catch (err) {
    throw new AppError("Token JWT inválido", 401);
  }
}

export function authorizeRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError("Usuário não autenticado", 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError("Acesso negado", 403);
    }

    next();
  };
}
