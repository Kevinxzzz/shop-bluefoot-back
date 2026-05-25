import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { z } from "zod";
import { generateInviteSchema, registerUserSchema } from "./user.schema.js";
import { env } from "../../shared/config/env.js";

type GenerateInviteInput = z.infer<typeof generateInviteSchema>;
type RegisterUserInput = z.infer<typeof registerUserSchema>;

export async function generateInviteToken(
  enterpriseId: string,
  userId: string,
  { maxUses, expiredAt }: GenerateInviteInput
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Criar o registro no banco com token temporário para gerar o ID
    const inviteRecord = await tx.enterpriseInviteToken.create({
      data: {
        token: "temp",
        maxUses,
        expiredAt: new Date(expiredAt),
        enterpriseId,
        createdByAdminId: userId,
      },
    });

    // 2. Gerar o JWT com o ID do registro
    const jwtToken = jwt.sign(
      { inviteTokenId: inviteRecord.id, enterpriseId },
      env.JWT_SECRET || "default_secret"
    );

    // 3. Atualizar o registro com o token real
    const updatedInvite = await tx.enterpriseInviteToken.update({
      where: { id: inviteRecord.id },
      data: { token: jwtToken },
    });

    return updatedInvite;
  });

  return result;
}

export async function registerUserWithInvite({
  inviteToken,
  name,
  email,
  password,
}: RegisterUserInput) {
  let decoded: { inviteTokenId: string; enterpriseId: string };

  try {
    decoded = jwt.verify(
      inviteToken,
      env.JWT_SECRET || "default_secret"
    ) as { inviteTokenId: string; enterpriseId: string };
  } catch (err) {
    throw new AppError("Token de convite inválido ou mal formatado", 400);
  }

  const inviteRecord = await prisma.enterpriseInviteToken.findUnique({
    where: { id: decoded.inviteTokenId },
    include: { usedBy: true },
  });

  if (!inviteRecord || inviteRecord.token !== inviteToken) {
    throw new AppError("Token de convite não encontrado", 404);
  }

  if (inviteRecord.canceledAt) {
    throw new AppError("Este convite foi cancelado", 400);
  }

  if (inviteRecord.expiredAt && new Date() > inviteRecord.expiredAt) {
    throw new AppError("Este convite está expirado", 400);
  }

  if (inviteRecord.usedBy.length >= inviteRecord.maxUses) {
    throw new AppError("Este convite atingiu o limite máximo de usos", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError("E-mail já está em uso", 400);
  }

  const sellerRole = await prisma.userRole.findFirst({
    where: { role: "SELLER" },
  });

  if (!sellerRole) {
    throw new AppError("Role SELLER não encontrada", 500);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleId: sellerRole.id,
        enterpriseId: decoded.enterpriseId,
      },
    });

    await tx.userToken.create({
      data: {
        userId: user.id,
        tokenId: inviteRecord.id,
      },
    });

    return user;
  });

  const tokenPayload = {
    userId: result.id,
    email: result.email,
    role: sellerRole.role,
    enterpriseId: result.enterpriseId,
  };

  const token = jwt.sign(tokenPayload, env.JWT_SECRET || "default_secret", {
    expiresIn: "1d",
  });

  return {
    token,
    user: {
      id: result.id,
      name: result.name,
      email: result.email,
      role: sellerRole.role,
    },
  };
}
