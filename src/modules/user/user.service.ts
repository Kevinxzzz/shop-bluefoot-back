import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../../shared/config/s3.js";
import { env } from "../../shared/config/env.js";
import { deleteProductMediaFiles } from "../upload/upload.service.js";
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
      profileImageUrl: true,
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
    profileImageUrl: user.profileImageUrl,
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

export async function getEnterpriseUsersPublic(enterpriseId: string) {
  const users = await prisma.user.findMany({
    where: {
      enterpriseId,
      deletedAt: null, // Apenas usuários ativos
    },
    select: {
      id: true,
      name: true,
      profileImageUrl: true,
      _count: {
        select: {
          products: {
            where: {
              deletedAt: null, // Apenas conta produtos não deletados
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    imageUrl: user.profileImageUrl, // Mapeado conforme solicitado
    productsCount: user._count.products, // Mapeado conforme solicitado
  }));
}

export async function getPublicUserById(userId: string, enterpriseId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      enterpriseId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      profileImageUrl: true,
      contactLink: true,
      products: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          price: true,
          countViews: true,
          createdAt: true,
          media: {
            orderBy: { order: "asc" },
            select: { id: true, url: true, type: true, order: true },
          },
          categories: {
            select: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError("Vendedor não encontrado", 404);
  }

  return user;
}

export async function deleteUserPermanently(
  userId: string,
  enterpriseId: string
) {
  const userTarget = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      products: {
        include: {
          media: true,
        },
      },
    },
  });

  if (!userTarget || userTarget.enterpriseId !== enterpriseId) {
    throw new AppError("Usuário não encontrado", 404);
  }

  const founderAdmin = await getFounderAdmin(enterpriseId);
  if (founderAdmin?.id === userId) {
    throw new AppError("O administrador fundador da empresa não pode ser excluído", 403);
  }


  const productMediaKeys = userTarget.products.flatMap(p => p.media.map(m => m.key));

  try {
    if (userTarget.profileImageKey) {
      const command = new DeleteObjectCommand({
        Bucket: env.AWS_BUCKET_NAME!,
        Key: userTarget.profileImageKey,
      });
      await s3.send(command);
    }

    if (productMediaKeys.length > 0) {
      await deleteProductMediaFiles(productMediaKeys);
    }
  } catch (error) {
    console.error("Erro ao excluir arquivos do bucket S3 durante a exclusão de usuário:", error);
    throw new AppError("Falha ao remover arquivos associados. A exclusão do usuário foi abortada.", 500);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.delete({
      where: { id: userId },
    });
  });
}

