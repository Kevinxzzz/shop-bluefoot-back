import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";

interface TokenPayload {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: string;
        enterpriseId: string;
      };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("Token JWT não informado", 401);
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AppError("Token JWT mal formatado", 401);
  }

  try {
    const secret = env.JWT_SECRET;
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as unknown as TokenPayload;

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        enterpriseId: true,
        role: {
          select: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado ou inativo", 401);
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role.role,
      enterpriseId: user.enterpriseId,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) throw err;
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
