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

export const getProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export const updateProductSchema = z.object({
  name: z.string().min(1, "O nome é obrigatório").optional(),
  description: z.string().optional(),
  price: z.number().int().positive("O preço deve ser positivo").optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const updateProductMediaSchema = z.object({
  keepMediaIds: z
    .array(z.string().uuid())
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "keepMediaIds não pode conter IDs duplicados.",
    })
    .optional()
    .default([]),
});

export type UpdateProductMediaInput = z.infer<typeof updateProductMediaSchema>;
