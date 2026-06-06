import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../shared/config/env.js";

import { loginSchema, registerSellerSchema } from "./auth.schema.js";

type LoginInput = z.infer<typeof loginSchema>;
type RegisterSellerInput = z.infer<typeof registerSellerSchema>;

export async function LoggingIn({ email, password }: LoginInput) {
  const user = await prisma.user.findFirst({
    where: {
      email,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      enterpriseId: true,
      role: {
        select: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const passwordMatch = await bcrypt.compare(password, user.password);

  if (!passwordMatch) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role.role,
    enterpriseId: user.enterpriseId,
  };

  const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
    expiresIn: "7d",
    algorithm: "HS256",
  });

  return {
    token,

    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.role,
      enterpriseId: user.enterpriseId,
    },
  };
}

export async function registerSellerWithToken(payload: RegisterSellerInput) {
  return await prisma.$transaction(async (tx) => {
    // 1. Encontra token no banco (busca O(1) devido ao formato raw armazenado)
    const inviteToken = await tx.enterpriseInviteToken.findFirst({
      where: { token: payload.token },
    });

    if (!inviteToken) {
      throw new AppError("Convite inválido ou indisponível", 400);
    }

    if (inviteToken.canceledAt) {
      throw new AppError("Convite inválido ou indisponível", 400);
    }

    if (new Date() > inviteToken.expiredAt) {
      throw new AppError("Convite inválido ou indisponível", 400);
    }

    // 2. Conta usos atuais (lock garantido pelo prisma.$transaction)
    const usageCount = await tx.userToken.count({
      where: { tokenId: inviteToken.id },
    });

    if (usageCount >= inviteToken.maxUses) {
      throw new AppError("Convite inválido ou indisponível", 400);
    }

    // 3. Checa email duplicado
    const existingUser = await tx.user.findFirst({
      where: { email: payload.email, deletedAt: null },
    });

    if (existingUser) {
      throw new AppError("E-mail já está em uso", 400);
    }

    const sellerRole = await tx.userRole.findFirst({
      where: { role: "SELLER" }
    });
    
    if (!sellerRole) {
       throw new AppError("Role SELLER não configurada", 500);
    }

    const hashedPassword = await bcrypt.hash(payload.password, 10);

    const newUser = await tx.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        password: hashedPassword,
        roleId: sellerRole.id,
        enterpriseId: inviteToken.enterpriseId,
      },
    });

    await tx.userToken.create({
      data: {
        userId: newUser.id,
        tokenId: inviteToken.id,
      },
    });

    // Revoga automaticamente se atingiu limite
    if (usageCount + 1 >= inviteToken.maxUses) {
      await tx.enterpriseInviteToken.update({
        where: { id: inviteToken.id },
        data: { canceledAt: new Date() },
      });
    }

    const tokenPayload = {
      userId: newUser.id,
      email: newUser.email,
      role: "SELLER",
      enterpriseId: newUser.enterpriseId,
    };

    const jwtToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
      expiresIn: "7d",
      algorithm: "HS256",
    });

    return {
      token: jwtToken,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: "SELLER",
        enterpriseId: newUser.enterpriseId,
      },
    };
  });
}
