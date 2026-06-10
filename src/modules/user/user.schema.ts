import { z } from "zod";

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

export const updateProfileSchema = z.object({
  name: z.string().min(1, "O nome não pode estar vazio").optional(),
  email: z.string().email("Email inválido").optional(),
  contactLink: z.string().max(255).optional(),
}).strict();

export const getPublicUserByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid("ID inválido"),
  }),
});

export const deleteUserSchema = z.object({
  params: z.object({
    id: z.string().uuid("ID inválido"),
  }),
  user: z.object({
    userId: z.string(),
    enterpriseId: z.string()
  }, {
    message: "Usuário não autenticado corretamente"
  })
}).refine(data => data.params.id !== data.user.userId, {
  message: "Você não pode excluir sua própria conta",
  path: ["params", "id"]
});

