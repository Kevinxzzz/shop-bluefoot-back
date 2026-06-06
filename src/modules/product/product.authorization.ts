import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";

export async function getAuthorizedProduct(
  productId: string,
  user: { userId: string; role: string; enterpriseId: string },
  action: "read" | "update" | "delete"
) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      enterpriseId: user.enterpriseId,
      deletedAt: null,
    },
    include: {
      categories: true,
      media: true,
      user: {
        select: { id: true, name: true },
      },
    },
  });

  if (!product) {
    throw new AppError("Produto não encontrado", 404);
  }

  const isOwner = product.userId === user.userId;
  const isAdmin = user.role === "ADMIN";

  if (action === "update") {
    if (!isOwner) throw new AppError("Acesso negado para edição", 403);
  } else if (action === "delete") {
    if (!isAdmin && !isOwner) throw new AppError("Acesso negado para exclusão", 403);
  } else if (action === "read") {
    if (!isAdmin && !isOwner) throw new AppError("Acesso negado para leitura", 403);
  }

  return product;
}

export function validateEnterpriseReadPermission(role: string) {
  if (role !== "ADMIN") {
    throw new AppError("Acesso restrito para administradores.", 403);
  }
}

export function validateUserReadPermission(requestedUserId: string, currentUser: { userId: string; role: string }) {
  if (currentUser.role === "SELLER" && currentUser.userId !== requestedUserId) {
    throw new AppError("Acesso negado para listar produtos de outro usuário", 403);
  }
}
