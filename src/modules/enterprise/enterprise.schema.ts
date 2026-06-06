import { z } from "zod";

export const createEnterpriseSchema = z.object({
  document: z.string().length(14, "CNPJ deve ter exatamente 14 dígitos").regex(/^\d{14}$/, "CNPJ deve conter apenas números"),
  name: z.string().min(1, "Nome da empresa é obrigatório"),
  phoneNumber: z.string().min(1, "Telefone da empresa é obrigatório"),
  fantasyName: z.string().optional(),
  contactLink: z.string().url("Link de contato inválido").optional(),
  userName: z.string().min(1, "Nome do usuário é obrigatório"),
  userEmail: z.string().email("Email inválido"),
  userPassword: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

export const updateEnterpriseSchema = z
  .object({
    name: z.string().trim().min(1, "Nome da empresa não pode ser vazio"),
    phone: z.string().trim().min(1, "Telefone não pode ser vazio"),
    salesGroupLink: z
      .string()
      .trim()
      .url("Link do grupo de vendas deve ser uma URL válida")
      .nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualização",
  });
