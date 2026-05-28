import { z } from "zod";

export const generateInviteSchema = z.object({
  maxUses: z.number().int().min(1, "O número máximo de usos deve ser pelo menos 1"),
  expiredAt: z.string().datetime("Data de expiração inválida"),
});

export const registerUserSchema = z.object({
  inviteToken: z.string().min(1, "O token de convite é obrigatório"),
  name: z.string().min(1, "O nome é obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

export const updateUserRoleSchema = z.object({
  params: z.object({
    id: z.string().uuid("ID inválido"),
  }),
  body: z.object({
    role: z.enum(["ADMIN", "SELLER"], {
      message: "Role inválida",
    }),
  }),
});
