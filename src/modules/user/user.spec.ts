import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  listUsers,
  updateUserRole,
  updateProfile,
  getProfile,
  getEnterpriseUsersPublic,
  getPublicUserById,
  deleteUserPermanently,
} from "./user.service.js";
import { prisma } from "../../shared/database/prisma.js";
import { s3 } from "../../shared/config/s3.js";
import {
  updateUserRoleSchema,
  updateProfileSchema,
  deleteUserSchema,
} from "./user.schema.js";

describe("User Module", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("Zod Schemas", () => {
    it("deve validar updateUserRoleSchema", () => {
      const valid = updateUserRoleSchema.safeParse({
        params: { id: "123e4567-e89b-12d3-a456-426614174000" },
        body: { role: "ADMIN" },
      });
      expect(valid.success).toBe(true);

      const invalidRole = updateUserRoleSchema.safeParse({
        params: { id: "123e4567-e89b-12d3-a456-426614174000" },
        body: { role: "SUPER_USER" },
      });
      expect(invalidRole.success).toBe(false);
    });

    it("deve validar updateProfileSchema com strict", () => {
      const valid = updateProfileSchema.safeParse({
        name: "Nome Atualizado",
        email: "novo@email.com",
      });
      expect(valid.success).toBe(true);

      const extraField = updateProfileSchema.safeParse({
        name: "Nome",
        roleId: "not-allowed",
      });
      expect(extraField.success).toBe(false);
    });

    it("deve impedir usuário de excluir a si próprio via deleteUserSchema", () => {
      const parsed = deleteUserSchema.safeParse({
        params: { id: "user-1" },
        user: { userId: "user-1", enterpriseId: "ent-1" },
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("listUsers", () => {
    it("1. deve listar usuários da empresa e identificar o administrador fundador", async () => {
      const mockUsers = [
        {
          id: "founder-id",
          name: "Fundador",
          email: "founder@corp.com",
          profileImageUrl: null,
          profileImageKey: null,
          role: { role: "ADMIN" },
          createdAt: new Date(),
          deletedAt: null,
        },
        {
          id: "seller-id",
          name: "Vendedor",
          email: "seller@corp.com",
          profileImageUrl: null,
          profileImageKey: null,
          role: { role: "SELLER" },
          createdAt: new Date(),
          deletedAt: null,
        },
      ];

      jest.spyOn(prisma.user, "findMany").mockResolvedValue(mockUsers as any);
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "founder-id",
      } as any);

      const result = await listUsers("ent-1");

      expect(result).toHaveLength(2);
      expect(result[0].isFounder).toBe(true);
      expect(result[1].isFounder).toBe(false);
      expect(result[0].status).toBe("ACTIVE");
    });
  });

  describe("updateUserRole", () => {
    it("2. deve atualizar o cargo de outro usuário com sucesso", async () => {
      jest.spyOn(prisma.user, "findFirst")
        .mockResolvedValueOnce({ id: "founder-id" } as any) // founder admin check
        .mockResolvedValueOnce({
          id: "seller-id",
          role: { role: "SELLER" },
        } as any); // target user

      jest.spyOn(prisma.userRole, "findUnique").mockResolvedValue({
        id: "role-admin-id",
        role: "ADMIN",
      } as any);

      jest.spyOn(prisma.user, "update").mockResolvedValue({
        id: "seller-id",
        name: "Vendedor",
        email: "seller@test.com",
        role: { role: "ADMIN" },
        deletedAt: null,
      } as any);

      const result = await updateUserRole({
        userId: "seller-id",
        role: "ADMIN",
        enterpriseId: "ent-1",
        adminId: "founder-id",
      });

      expect(result.role).toBe("ADMIN");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "seller-id" },
        data: { roleId: "role-admin-id" },
        select: expect.any(Object),
      });
    });

    it("3. deve impedir que o admin altere sua própria role", async () => {
      await expect(
        updateUserRole({
          userId: "admin-1",
          role: "SELLER",
          enterpriseId: "ent-1",
          adminId: "admin-1",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Você não pode alterar sua própria role",
      });
    });

    it("4. deve impedir alteração de cargo do fundador da empresa", async () => {
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "founder-id",
      } as any);

      await expect(
        updateUserRole({
          userId: "founder-id",
          role: "SELLER",
          enterpriseId: "ent-1",
          adminId: "secondary-admin",
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message:
          "O administrador fundador da empresa não pode ter o cargo alterado",
      });
    });

    it("5. deve falhar se o usuário já tiver o cargo solicitado", async () => {
      jest.spyOn(prisma.user, "findFirst")
        .mockResolvedValueOnce({ id: "founder-id" } as any)
        .mockResolvedValueOnce({
          id: "user-target",
          role: { role: "ADMIN" },
        } as any);

      jest.spyOn(prisma.userRole, "findUnique").mockResolvedValue({
        id: "role-admin-id",
        role: "ADMIN",
      } as any);

      await expect(
        updateUserRole({
          userId: "user-target",
          role: "ADMIN",
          enterpriseId: "ent-1",
          adminId: "founder-id",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Usuário já possui esta role",
      });
    });
  });

  describe("updateProfile", () => {
    it("6. deve atualizar perfil com sucesso", async () => {
      jest.spyOn(prisma.user, "update").mockResolvedValue({
        id: "user-1",
        name: "Nome Novo",
        email: "novo@test.com",
        profileImageUrl: null,
        profileImageKey: null,
        contactLink: "https://wa.me/123",
        role: { role: "SELLER" },
      } as any);

      const result = await updateProfile("user-1", {
        name: "Nome Novo",
        email: "novo@test.com",
      });

      expect(result.name).toBe("Nome Novo");
      expect(result.email).toBe("novo@test.com");
    });

    it("7. deve falhar se nenhum dado for fornecido para atualização", async () => {
      await expect(updateProfile("user-1", {})).rejects.toMatchObject({
        statusCode: 400,
        message: "Nenhum dado fornecido para atualização",
      });
    });

    it("8. deve retornar 409 caso e-mail ou link de contato já estejam em uso", async () => {
      const p2002Error: any = new Error("Unique constraint failed on email");
      p2002Error.code = "P2002";
      p2002Error.meta = { target: ["email"] };

      jest.spyOn(prisma.user, "update").mockRejectedValue(p2002Error);

      await expect(
        updateProfile("user-1", { email: "duplicated@test.com" })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "E-mail já está em uso",
      });
    });
  });

  describe("getProfile", () => {
    it("9. deve buscar perfil do usuário", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "user-1",
        name: "João",
        email: "joao@test.com",
        contactLink: null,
        profileImageUrl: null,
        profileImageKey: null,
        role: { role: "ADMIN" },
      } as any);

      const result = await getProfile("user-1");

      expect(result).toEqual({
        id: "user-1",
        name: "João",
        email: "joao@test.com",
        contactLink: null,
        profileImageUrl: null,
        role: "ADMIN",
      });
    });

    it("10. deve lançar 404 se usuário não for encontrado", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null as any);

      await expect(getProfile("unknown-user")).rejects.toMatchObject({
        statusCode: 404,
        message: "Usuário não encontrado",
      });
    });
  });

  describe("getEnterpriseUsersPublic", () => {
    it("11. deve retornar vendedores públicos da empresa com contagem de produtos", async () => {
      jest.spyOn(prisma.user, "findMany").mockResolvedValue([
        {
          id: "u-1",
          name: "Vendedor 1",
          profileImageUrl: null,
          profileImageKey: null,
          _count: { products: 5 },
        },
      ] as any);

      const result = await getEnterpriseUsersPublic("ent-1");

      expect(result).toEqual([
        {
          id: "u-1",
          name: "Vendedor 1",
          imageUrl: null,
          productsCount: 5,
        },
      ]);
    });
  });

  describe("getPublicUserById", () => {
    it("12. deve buscar vendedor público e seus produtos ativos", async () => {
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "seller-1",
        name: "Vendedor Show",
        profileImageUrl: null,
        profileImageKey: null,
        contactLink: "https://contact",
        products: [
          {
            id: "prod-1",
            name: "Produto 1",
            price: 100,
            countViews: 10,
            createdAt: new Date(),
            media: [],
            categories: [],
          },
        ],
      } as any);

      const result = await getPublicUserById("seller-1", "ent-1");

      expect(result.id).toBe("seller-1");
      expect(result.products).toHaveLength(1);
    });

    it("13. deve retornar 404 se o vendedor não existir na empresa", async () => {
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue(null as any);

      await expect(
        getPublicUserById("seller-nonexistent", "ent-1")
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Vendedor não encontrado",
      });
    });
  });

  describe("deleteUserPermanently", () => {
    it("14. deve excluir usuário e remover mídias associadas", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "seller-del",
        enterpriseId: "ent-1",
        profileImageKey: "avatar-del.jpg",
        products: [
          {
            id: "prod-1",
            media: [{ key: "prod-media-1.jpg" }],
          },
        ],
      } as any);

      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "different-founder-id",
      } as any); // Founder check

      jest.spyOn(s3, "send").mockImplementation(() => Promise.resolve({} as never));

      const mockTx = {
        user: {
          delete: jest.fn<any>().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      await deleteUserPermanently("seller-del", "ent-1");

      expect(s3.send).toHaveBeenCalled();
      expect(mockTx.user.delete).toHaveBeenCalledWith({
        where: { id: "seller-del" },
      });
    });

    it("15. deve impedir exclusão do administrador fundador", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "founder-id",
        enterpriseId: "ent-1",
        products: [],
      } as any);

      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "founder-id",
      } as any);

      await expect(
        deleteUserPermanently("founder-id", "ent-1")
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "O administrador fundador da empresa não pode ser excluído",
      });
    });

    it("16. deve abortar exclusão se a remoção dos arquivos do S3 falhar", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: "seller-del",
        enterpriseId: "ent-1",
        profileImageKey: "avatar.jpg",
        products: [],
      } as any);

      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "founder-id",
      } as any);

      jest
        .spyOn(s3, "send")
        .mockRejectedValue(new Error("S3 Deletion Network Error") as never);

      jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        deleteUserPermanently("seller-del", "ent-1")
      ).rejects.toMatchObject({
        statusCode: 500,
        message:
          "Falha ao remover arquivos associados. A exclusão do usuário foi abortada.",
      });
    });
  });
});
