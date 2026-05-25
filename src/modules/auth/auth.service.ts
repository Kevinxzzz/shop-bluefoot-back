import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { prisma } from "../../shared/database/prisma.js";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../../shared/config/env.js";

import { loginSchema } from "./auth.schema.js";

type LoginInput = z.infer<typeof loginSchema>;

export async function LoggingIn({
    email,
    password,
}: LoginInput) {
    const user = await prisma.user.findFirst({
        where: {
            email,
            deletedAt: null,
        },

        include: {
            role: true,
        },
    });

    if (!user) {
        throw new AppError(
            "Credenciais inválidas",
            401
        );
    }

    const passwordMatch = await bcrypt.compare(
        password,
        user.password
    );

    if (!passwordMatch) {
        throw new AppError(
            "Credenciais inválidas",
            401
        );
    }

    const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role.role,
        enterpriseId: user.enterpriseId,
    };

    const token = jwt.sign(
        tokenPayload,
        env.JWT_SECRET,
        {
            expiresIn: "7d",
            algorithm: "HS256",
        }
    );

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