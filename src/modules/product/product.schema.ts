import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1, "O nome é obrigatório"),
  description: z.string().optional(),
  price: z.number().int().positive("O preço deve ser positivo").optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  media: z.array(
    z.object({
      url: z.string().url("A URL deve ser válida"),
      key: z.string().min(1, "A key é obrigatória"),
      type: z.enum(["FOTO", "VIDEO"]),
      isMain: z.boolean().optional(),
    })
  ).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
