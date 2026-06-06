import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";

interface TokenPayload {
  userId: string;
}

export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) return next();

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) return next();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as unknown as TokenPayload;

    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        enterpriseId: true,
        role: {
          select: {
            role: true,
          },
        },
      },
    });

    if (user) {
      req.user = {
        id: user.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role.role,
        enterpriseId: user.enterpriseId,
      };
    }
  } catch {
    // Token inválido ou expirado — continua como visitante
  }

  next();
}
