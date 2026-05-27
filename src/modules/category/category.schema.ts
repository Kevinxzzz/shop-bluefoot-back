import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "O nome da categoria é obrigatório").trim(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1, "O nome da categoria é obrigatório").trim().optional(),
});

export const queryCategorySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["ACTIVE", "DELETED", "ALL"]).default("ACTIVE"),
});
