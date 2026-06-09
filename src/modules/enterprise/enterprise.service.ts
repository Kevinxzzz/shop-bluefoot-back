import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../shared/config/env.js";

import { createEnterpriseSchema } from "./enterprise.schema.js";

type CreateEnterpriseInput = z.infer<typeof createEnterpriseSchema>;

export async function createEnterprise({
  document,
  name,
  phoneNumber,
  contactLink,
  userName,
  userEmail,
  userPassword,
}: CreateEnterpriseInput) {
  // Verifica empresa existente

  const existingEnterprise = await prisma.enterprise.findUnique({
    where: {
      cnpj: document,
    },
  });

  if (existingEnterprise) {
    throw new AppError("Empresa já cadastrada com este CNPJ", 400);
  }

  // Verifica email existente
  const existingUser = await prisma.user.findUnique({
    where: {
      email: userEmail,
    },
  });

  if (existingUser) {
    throw new AppError("E-mail já está em uso", 400);
  }

  // Verifica contactLink duplicado
  if (contactLink) {
    const existingContactLink = await prisma.user.findUnique({
      where: {
        contactLink,
      },
    });

    if (existingContactLink) {
      throw new AppError("Link de contato já está em uso", 400);
    }
  }

  // Busca role ADMIN criada pelo seed
  const adminRole = await prisma.userRole.findFirst({
    where: {
      role: "ADMIN",
    },
  });

  if (!adminRole) {
    throw new AppError("Role ADMIN não encontrada. Execute as seeds.", 500);
  }

  const hashedPassword = await bcrypt.hash(userPassword, 10);

  // Transaction
  const result = await prisma.$transaction(async (tx) => {
    const countEnterprise = await tx.enterprise.count();
    if (countEnterprise >= 3) {
      throw new AppError(
        "O limite de empresa cadastradas ja foi atingido.",
        400,
      );
    }

    const enterprise = await tx.enterprise.create({
      data: {
        cnpj: document,
        name,
        phoneNumber,
      },
    });

    const user = await tx.user.create({
      data: {
        name: userName,
        email: userEmail,
        password: hashedPassword,

        contactLink: contactLink || null,

        roleId: adminRole.id,

        enterpriseId: enterprise.id,
      },
    });

    return {
      enterprise,
      user,
    };
  });

  const tokenPayload = {
    userId: result.user.id,
    role: adminRole.role,
    enterpriseId: result.enterprise.id,
  };

  const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
    expiresIn: "1d",
    algorithm: "HS256",
  });

  return {
    token,

    enterprise: {
      id: result.enterprise.id,
      name: result.enterprise.name,
      cnpj: result.enterprise.cnpj,
    },

    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: adminRole.role,
      enterpriseId: result.enterprise.id,
    },
  };
}

export async function getEnterprise(enterpriseId: string) {
  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    select: {
      id: true,
      name: true,
      cnpj: true,
      phoneNumber: true,
      links: {
        select: {
          link: true,
        },
      },
    },
  });

  if (!enterprise) {
    throw new AppError("Empresa não encontrada", 404);
  }

  return {
    name: enterprise.name,
    document: enterprise.cnpj,
    phone: enterprise.phoneNumber,
    salesGroupLink: enterprise.links[0]?.link ?? null,
  };
}

type UpdateEnterpriseInput = z.infer<
  typeof import("./enterprise.schema.js").updateEnterpriseSchema
>;

export async function updateEnterprise({
  enterpriseId,
  data,
}: {
  enterpriseId: string;
  data: UpdateEnterpriseInput;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const enterprise = await tx.enterprise.findUnique({
      where: { id: enterpriseId },
    });

    if (!enterprise) {
      throw new AppError("Empresa não encontrada", 404);
    }

    const updatedEnterprise = await tx.enterprise.update({
      where: { id: enterpriseId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.phone && { phoneNumber: data.phone }),
      },
    });

    let salesGroupLink = null;

    if (data.salesGroupLink !== undefined) {
      const existingLink = await tx.enterpriseLinkGroup.findFirst({
        where: { enterpriseId },
      });

      if (data.salesGroupLink === null) {
        if (existingLink) {
          await tx.enterpriseLinkGroup.delete({
            where: { id: existingLink.id },
          });
        }
      } else {
        if (existingLink) {
          const updatedLink = await tx.enterpriseLinkGroup.update({
            where: { id: existingLink.id },
            data: { link: data.salesGroupLink },
          });
          salesGroupLink = updatedLink.link;
        } else {
          const newLink = await tx.enterpriseLinkGroup.create({
            data: {
              enterpriseId,
              link: data.salesGroupLink,
            },
          });
          salesGroupLink = newLink.link;
        }
      }
    } else {
      const existingLink = await tx.enterpriseLinkGroup.findFirst({
        where: { enterpriseId },
      });
      salesGroupLink = existingLink?.link ?? null;
    }

    return {
      name: updatedEnterprise.name,
      document: updatedEnterprise.cnpj,
      phone: updatedEnterprise.phoneNumber,
      salesGroupLink,
    };
  });

  return result;
}

export async function getEnterpriseFirstLink(enterpriseId: string) {
  const linkGroup = await prisma.enterpriseLinkGroup.findFirst({
    where: { enterpriseId },
    select: { link: true },
  });

  return { link: linkGroup?.link ?? null };
}
