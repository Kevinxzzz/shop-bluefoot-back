import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { z } from "zod";

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
      const targetStr = JSON.stringify(err.meta || "").toLowerCase() + " " + err.message.toLowerCase();
      
      if (target?.includes("email") || targetStr.includes("email")) {
        throw new AppError("E-mail já está em uso", 409);
      }
      if (target?.includes("link_contact") || targetStr.includes("link_contact")) {
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

