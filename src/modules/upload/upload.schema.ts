import { z } from "zod";

export const uploadImageProfileSchema = z.object({
  key: z.string().min(1, "A key da imagem é obrigatória"),
});

export type UploadImageProfileInput = z.infer<typeof uploadImageProfileSchema>;
