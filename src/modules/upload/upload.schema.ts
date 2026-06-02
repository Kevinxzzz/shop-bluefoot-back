import { z } from "zod";

export const uploadImageProfileSchema = z.object({
  location: z.string().url("A URL da imagem deve ser válida"),
  key: z.string().min(1, "A key da imagem é obrigatória"),
});

export type UploadImageProfileInput = z.infer<typeof uploadImageProfileSchema>;
