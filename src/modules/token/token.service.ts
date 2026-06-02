import crypto from "crypto";
import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../shared/config/env.js";

interface CreateTokenData {
  maxUses: number;
  expiredAt: string;
  enterpriseId: string;
  adminId: string;
}

export async function createInviteToken(data: CreateTokenData) {
  // Generate a cryptographically secure token
  const rawToken = crypto.randomBytes(32).toString("hex");

  const newRecord = await prisma.enterpriseInviteToken.create({
    data: {
      token: rawToken,
      maxUses: data.maxUses,
      expiredAt: new Date(data.expiredAt),
      enterpriseId: data.enterpriseId,
      createdByAdminId: data.adminId,
    },
  });

  // Return the raw token ONLY once, along with the created ID
  return {
    id: newRecord.id,
    rawToken,
    createdAt: newRecord.createdAt,
  };
}

export async function revokeInviteToken(tokenId: string, enterpriseId: string) {
  const token = await prisma.enterpriseInviteToken.findFirst({
    where: {
      id: tokenId,
      enterpriseId: enterpriseId,
      canceledAt: null, // Only revoke active tokens
    },
  });

  if (!token) {
    throw new AppError("Token não encontrado ou já revogado", 404);
  }

  await prisma.enterpriseInviteToken.update({
    where: { id: tokenId },
    data: { canceledAt: new Date() },
  });
}

export async function listTokens(enterpriseId: string, page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;

  const [total, tokens] = await Promise.all([
    prisma.enterpriseInviteToken.count({
      where: { enterpriseId },
    }),
    prisma.enterpriseInviteToken.findMany({
      where: { enterpriseId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        token: true,
        maxUses: true,
        createdAt: true,
        expiredAt: true,
        canceledAt: true,
        _count: {
          select: { usedBy: true },
        },
      },
    }),
  ]);

  const data = tokens.map((t) => {
    let status = "ACTIVE";
    if (t.canceledAt) {
      status = "CANCELED";
    } else if (new Date() > t.expiredAt) {
      status = "EXPIRED";
    } else if (t._count.usedBy >= t.maxUses) {
      status = "MAXED_OUT";
    }

    return {
      id: t.id,
      token: t.token,
      inviteUrl: `${env.FRONTEND_URL}/convite/${t.token}`,
      maxUses: t.maxUses,
      createdAt: t.createdAt,
      expiredAt: t.expiredAt,
      canceledAt: t.canceledAt,
      _count: t._count,
      status,
    };
  });

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function validateInviteToken(rawToken: string) {
  const token = await prisma.enterpriseInviteToken.findFirst({
    where: { token: rawToken },
    select: {
      enterprise: { select: { name: true } },
      _count: { select: { usedBy: true } },
      canceledAt: true,
      expiredAt: true,
      maxUses: true,
    },
  });

  if (!token) {
    throw new AppError("Convite inválido ou não encontrado", 400);
  }

  if (token.canceledAt) {
    throw new AppError("Convite revogado", 400);
  }

  if (new Date() > token.expiredAt) {
    throw new AppError("Convite expirado", 400);
  }

  if (token._count.usedBy >= token.maxUses) {
    throw new AppError("Limite de usos do convite atingido", 400);
  }

  return {
    valid: true,
    enterpriseName: token.enterprise.name,
    maxUses: token.maxUses,
    currentUses: token._count.usedBy,
    expiredAt: token.expiredAt,
  };
}

