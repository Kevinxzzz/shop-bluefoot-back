import { z } from "zod";

export const createTokenSchema = z.object({
  maxUses: z.number().int().positive("maxUses deve ser um número inteiro maior que zero"),
  expiredAt: z.string().datetime().refine(val => new Date(val) > new Date(), {
    message: "expiredAt deve ser uma data no futuro",
  }),
});

export const revokeTokenSchema = z.object({
  id: z.string().uuid("ID do token inválido"),
});

export const validateTokenSchema = z.object({
  rawToken: z.string().min(10, "Token inválido"),
});
