import { z } from "zod";

export const createEnterpriseSchema = z.object({
  document: z.string().min(14, "CNPJ deve ter 14 dígitos"),
  name: z.string().min(1, "Nome da empresa é obrigatório"),
  fantasyName: z.string().optional(),
  contactLink: z.string().url("Link de contato inválido").optional(),
  userName: z.string().min(1, "Nome do usuário é obrigatório"),
  userEmail: z.string().email("Email inválido"),
  userPassword: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});
