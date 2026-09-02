import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  createEnterprise,
  getEnterprise,
  updateEnterprise,
  getEnterpriseFirstLink,
} from "./enterprise.service.js";
import { prisma } from "../../shared/database/prisma.js";
import {
  createEnterpriseSchema,
  updateEnterpriseSchema,
} from "./enterprise.schema.js";

describe("Enterprise Module", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const validData = {
    document: "12345678901234",
    name: "Empresa Teste",
    phoneNumber: "11999999999",
    fantasyName: "Teste LTDA",
    contactLink: "https://wa.me/5511999999999",
    userName: "Admin Teste",
    userEmail: "admin@teste.com",
    userPassword: "password123",
  };

  describe("Zod Schemas", () => {
    it("deve validar payload correto de criação", () => {
      const parsed = createEnterpriseSchema.safeParse(validData);
      expect(parsed.success).toBe(true);
    });

    it("deve falhar se contactLink for uma URL inválida", () => {
      const parsed = createEnterpriseSchema.safeParse({
        ...validData,
        contactLink: "not-a-url",
      });
      expect(parsed.success).toBe(false);
    });

    it("deve falhar se senha for muito curta", () => {
      const parsed = createEnterpriseSchema.safeParse({
        ...validData,
        userPassword: "123",
      });
      expect(parsed.success).toBe(false);
    });

    it("deve falhar se payload de atualização for vazio", () => {
      const parsed = updateEnterpriseSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it("deve validar payload de atualização válido", () => {
      const parsed = updateEnterpriseSchema.safeParse({
        name: "Novo Nome",
        phone: "11988888888",
        salesGroupLink: "https://chat.whatsapp.com/test",
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("createEnterprise", () => {
    it("1. deve criar empresa e primeiro usuário admin com sucesso", async () => {
      jest.spyOn(prisma.enterprise, "findUnique").mockResolvedValue(null as any);
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null as any);
      jest.spyOn(prisma.userRole, "findFirst").mockResolvedValue({
        id: "role-admin-id",
        role: "ADMIN",
      } as any);

      const mockTx = {
        enterprise: {
          count: jest.fn<any>().mockResolvedValue(1),
          create: jest.fn<any>().mockResolvedValue({
            id: "ent-1",
            cnpj: validData.document,
            name: validData.name,
            phoneNumber: validData.phoneNumber,
          }),
        },
        user: {
          create: jest.fn<any>().mockResolvedValue({
            id: "user-1",
            name: validData.userName,
            email: validData.userEmail,
            roleId: "role-admin-id",
            enterpriseId: "ent-1",
          }),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      const result = await createEnterprise(validData);

      expect(result).toHaveProperty("token");
      expect(result.enterprise.id).toBe("ent-1");
      expect(result.enterprise.name).toBe(validData.name);
      expect(result.enterprise.cnpj).toBe(validData.document);
      expect(result.user.email).toBe(validData.userEmail);
      expect(result.user.role).toBe("ADMIN");
    });

    it("2. deve falhar se o CNPJ já estiver cadastrado", async () => {
      jest.spyOn(prisma.enterprise, "findUnique").mockResolvedValue({
        id: "ent-existing",
      } as any);

      await expect(createEnterprise(validData)).rejects.toMatchObject({
        statusCode: 400,
        message: "Empresa já cadastrada com este CNPJ",
      });
    });

    it("3. deve falhar se o e-mail já estiver em uso", async () => {
      jest.spyOn(prisma.enterprise, "findUnique").mockResolvedValue(null as any);
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-existing",
      } as any);

      await expect(createEnterprise(validData)).rejects.toMatchObject({
        statusCode: 400,
        message: "E-mail já está em uso",
      });
    });

    it("4. deve falhar se o contactLink já estiver em uso", async () => {
      jest.spyOn(prisma.enterprise, "findUnique").mockResolvedValue(null as any);
      jest
        .spyOn(prisma.user, "findUnique")
        .mockResolvedValueOnce(null as any) // email check
        .mockResolvedValueOnce({ id: "user-link" } as any); // contactLink check

      await expect(createEnterprise(validData)).rejects.toMatchObject({
        statusCode: 400,
        message: "Link de contato já está em uso",
      });
    });

    it("5. deve falhar se o limite de 3 empresas for atingido", async () => {
      jest.spyOn(prisma.enterprise, "findUnique").mockResolvedValue(null as any);
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null as any);
      jest.spyOn(prisma.userRole, "findFirst").mockResolvedValue({
        id: "role-admin-id",
        role: "ADMIN",
      } as any);

      const mockTx = {
        enterprise: {
          count: jest.fn<any>().mockResolvedValue(3),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      await expect(createEnterprise(validData)).rejects.toMatchObject({
        statusCode: 400,
        message: "O limite de empresa cadastradas ja foi atingido.",
      });
    });
  });

  describe("getEnterprise", () => {
    it("6. deve retornar dados da empresa", async () => {
      jest.spyOn(prisma.enterprise, "findUnique").mockResolvedValue({
        id: "ent-1",
        name: "Minha Empresa",
        cnpj: "12345678901234",
        phoneNumber: "11999999999",
        links: [{ link: "https://chat.whatsapp.com/test" }],
      } as any);

      const result = await getEnterprise("ent-1");

      expect(result).toEqual({
        name: "Minha Empresa",
        document: "12345678901234",
        phone: "11999999999",
        salesGroupLink: "https://chat.whatsapp.com/test",
      });
    });

    it("7. deve lançar 404 se a empresa não existir", async () => {
      jest.spyOn(prisma.enterprise, "findUnique").mockResolvedValue(null as any);

      await expect(getEnterprise("ent-nonexistent")).rejects.toMatchObject({
        statusCode: 404,
        message: "Empresa não encontrada",
      });
    });
  });

  describe("updateEnterprise", () => {
    it("8. deve atualizar dados da empresa e atualizar link existente", async () => {
      const mockTx = {
        enterprise: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: "ent-1" }),
          update: jest.fn<any>().mockResolvedValue({
            name: "Nome Atualizado",
            cnpj: "12345678901234",
            phoneNumber: "11888888888",
          }),
        },
        enterpriseLinkGroup: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: "link-1", link: "antigo" }),
          update: jest.fn<any>().mockResolvedValue({ link: "https://novo.link" }),
          delete: jest.fn(),
          create: jest.fn(),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      const result = await updateEnterprise({
        enterpriseId: "ent-1",
        data: {
          name: "Nome Atualizado",
          phone: "11888888888",
          salesGroupLink: "https://novo.link",
        },
      });

      expect(result.name).toBe("Nome Atualizado");
      expect(result.phone).toBe("11888888888");
      expect(result.salesGroupLink).toBe("https://novo.link");
      expect(mockTx.enterpriseLinkGroup.update).toHaveBeenCalledWith({
        where: { id: "link-1" },
        data: { link: "https://novo.link" },
      });
    });

    it("9. deve remover link quando salesGroupLink for passado como null", async () => {
      const mockTx = {
        enterprise: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: "ent-1" }),
          update: jest.fn<any>().mockResolvedValue({
            name: "Empresa",
            cnpj: "1234",
            phoneNumber: "111",
          }),
        },
        enterpriseLinkGroup: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: "link-1" }),
          delete: jest.fn<any>().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      const result = await updateEnterprise({
        enterpriseId: "ent-1",
        data: {
          salesGroupLink: null,
        },
      });

      expect(result.salesGroupLink).toBeNull();
      expect(mockTx.enterpriseLinkGroup.delete).toHaveBeenCalledWith({
        where: { id: "link-1" },
      });
    });

    it("10. deve lançar 404 se a empresa para atualizar não existir", async () => {
      const mockTx = {
        enterprise: {
          findUnique: jest.fn<any>().mockResolvedValue(null),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        updateEnterprise({
          enterpriseId: "ent-not-found",
          data: { name: "Teste" },
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Empresa não encontrada",
      });
    });
  });

  describe("getEnterpriseFirstLink", () => {
    it("11. deve retornar link quando existir", async () => {
      jest
        .spyOn(prisma.enterpriseLinkGroup, "findFirst")
        .mockResolvedValue({ link: "https://link.com" } as any);

      const result = await getEnterpriseFirstLink("ent-1");
      expect(result).toEqual({ link: "https://link.com" });
    });

    it("12. deve retornar null se não houver link", async () => {
      jest
        .spyOn(prisma.enterpriseLinkGroup, "findFirst")
        .mockResolvedValue(null as any);

      const result = await getEnterpriseFirstLink("ent-1");
      expect(result).toEqual({ link: null });
    });
  });
});
