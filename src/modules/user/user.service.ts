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
  { maxUses, expiredAt }: GenerateInviteInput,
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
      env.JWT_SECRET,
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
    decoded = jwt.verify(inviteToken, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as { inviteTokenId: string; enterpriseId: string };
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

  const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
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

async function getFounderAdmin(enterpriseId: string) {
  // O verdadeiro fundador é o único usuário que entrou na empresa
  // sem usar um token de convite (pois ele criou a empresa)
  const founder = await prisma.user.findFirst({
    where: {
      enterpriseId,
      deletedAt: null,
      role: {
        role: "ADMIN",
      },
      usedTokens: {
        none: {}
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true,
    },
  });

  return founder;
}

export async function listUsers(enterpriseId: string) {
  const users = await prisma.user.findMany({
    where: { enterpriseId },
    select: {
      id: true,
      name: true,
      email: true,
      role: {
        select: {
          role: true,
        },
      },
      createdAt: true,
      deletedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const founderAdmin = await getFounderAdmin(enterpriseId);

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.role,
    status: user.deletedAt ? "INACTIVE" : "ACTIVE",
    isFounder: user.id === founderAdmin?.id,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
  }));
}

export async function updateUserRole({
  userId,
  role,
  enterpriseId,
  adminId,
}: {
  userId: string;
  role: string;
  enterpriseId: string;
  adminId: string;
}) {
  if (adminId === userId) {
    throw new AppError("Você não pode alterar sua própria role", 400);
  }

  const founderAdmin = await getFounderAdmin(enterpriseId);
  if (founderAdmin?.id === userId) {
    throw new AppError(
      "O administrador fundador da empresa não pode ter o cargo alterado",
      403,
    );
  }

  const newRole = await prisma.userRole.findUnique({
    where: { role },
  });

  if (!newRole) {
    throw new AppError("Role inválida", 400);
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      enterpriseId,
      deletedAt: null,
    },
    select: {
      id: true,
      role: {
        select: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError("Usuário não encontrado", 404);
  }

  if (user.role.role === role) {
    throw new AppError("Usuário já possui esta role", 400);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { roleId: newRole.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: {
        select: {
          role: true,
        },
      },
      deletedAt: true,
    },
  });

  return {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role.role,
    status: updatedUser.deletedAt ? "INACTIVE" : "ACTIVE",
  };
}

type UpdateProfileInput = z.infer<typeof import("./user.schema.js").updateProfileSchema>;

export async function updateProfile(userId: string, data: UpdateProfileInput) {
  if (Object.keys(data).length === 0) {
    throw new AppError("Nenhum dado fornecido para atualização", 400);
  }

  const updateData = Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        profileImageUrl: true,
        contactLink: true,
        role: {
          select: {
            role: true,
          },
        },
      },
    });

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      profileImageUrl: updatedUser.profileImageUrl,
      contactLink: updatedUser.contactLink,
      role: updatedUser.role.role,
    };
  } catch (err: any) {
    // P2002 = Unique constraint failed
    if (err.code === "P2002") {
      const target = err.meta?.target as string[] | undefined;
      if (target?.includes("email")) {
        throw new AppError("E-mail já está em uso", 409);
      }
      if (target?.includes("link_contact")) {
        throw new AppError("Link de contato já está em uso", 409);
      }
      throw new AppError("O dado fornecido já está em uso", 409);
    }
    throw err;
  }
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      contactLink: true,
      profileImageUrl: true,
      role: {
        select: { role: true },
      },
    },
  });

  if (!user) {
    throw new AppError("Usuário não encontrado", 404);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    contactLink: user.contactLink,
    profileImageUrl: user.profileImageUrl,
    role: user.role.role,
  };
}

