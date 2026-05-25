import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../shared/config/env.js";

import { createEnterpriseSchema } from "./enterprise.schema.js";

type CreateEnterpriseInput = z.infer<
  typeof createEnterpriseSchema
>;

export async function createEnterprise({
  document,
  name,
  contactLink,
  userName,
  userEmail,
  userPassword,
}: CreateEnterpriseInput) {
  // Verifica empresa existente
  const existingEnterprise =
    await prisma.enterprise.findUnique({
      where: {
        cnpj: document,
      },
    });

  if (existingEnterprise) {
    throw new AppError(
      "Empresa já cadastrada com este CNPJ",
      400
    );
  }

  // Verifica email existente
  const existingUser =
    await prisma.user.findUnique({
      where: {
        email: userEmail,
      },
    });

  if (existingUser) {
    throw new AppError(
      "E-mail já está em uso",
      400
    );
  }

  // Verifica contactLink duplicado
  if (contactLink) {
    const existingContactLink =
      await prisma.user.findUnique({
        where: {
          contactLink,
        },
      });

    if (existingContactLink) {
      throw new AppError(
        "Link de contato já está em uso",
        400
      );
    }
  }

  // Busca role ADMIN criada pelo seed
  const adminRole =
    await prisma.userRole.findFirst({
      where: {
        role: "ADMIN",
      },
    });

  if (!adminRole) {
    throw new AppError(
      "Role ADMIN não encontrada. Execute as seeds.",
      500
    );
  }

  const hashedPassword =
    await bcrypt.hash(userPassword, 10);

  // Transaction
  const result = await prisma.$transaction(
    async (tx) => {
      const enterprise =
        await tx.enterprise.create({
          data: {
            cnpj: document,
            name,

            // TEMPORÁRIO:
            // seu schema exige phoneNumber obrigatório
            phoneNumber: crypto.randomUUID(),
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
    }
  );

  const tokenPayload = {
    userId: result.user.id,
    role: adminRole.role,
    enterpriseId: result.enterprise.id,
  };

  const token = jwt.sign(
    tokenPayload,
    env.JWT_SECRET,
    {
      expiresIn: "1d",
      algorithm: "HS256",
    }
  );

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