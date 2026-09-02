import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import bcrypt from "bcryptjs";
import { LoggingIn, registerSellerWithToken } from "./auth.service.js";
import { prisma } from "../../shared/database/prisma.js";
import { loginSchema, registerSellerSchema } from "./auth.schema.js";

describe("Auth Module", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("Zod Schemas", () => {
    it("deve validar dados válidos de login", () => {
      const parsed = loginSchema.safeParse({
        email: "user@test.com",
        password: "password123",
      });
      expect(parsed.success).toBe(true);
    });

    it("deve rejeitar email inválido ou senha menor que 6 caracteres", () => {
      expect(
        loginSchema.safeParse({ email: "invalid-email", password: "123456" })
          .success
      ).toBe(false);
      expect(
        loginSchema.safeParse({ email: "user@test.com", password: "123" })
          .success
      ).toBe(false);
    });

    it("deve validar dados válidos de registro de vendedor", () => {
      const parsed = registerSellerSchema.safeParse({
        token: "raw-token-123",
        name: "Vendedor Teste",
        email: "seller@test.com",
        password: "password123",
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("LoggingIn", () => {
    it("1. deve autenticar usuário ativo e retornar token JWT e dados do usuário", async () => {
      const hashedPassword = await bcrypt.hash("correct-password", 4);
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "user-1",
        name: "Admin",
        email: "admin@test.com",
        password: hashedPassword,
        enterpriseId: "ent-1",
        role: { role: "ADMIN" },
      } as any);

      const result = await LoggingIn({
        email: "admin@test.com",
        password: "correct-password",
      });

      expect(result).toHaveProperty("token");
      expect(result.user).toEqual({
        id: "user-1",
        name: "Admin",
        email: "admin@test.com",
        role: "ADMIN",
        enterpriseId: "ent-1",
      });
    });

    it("2. deve falhar autenticação se a senha for incorreta", async () => {
      const hashedPassword = await bcrypt.hash("correct-password", 4);
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "user-1",
        email: "admin@test.com",
        password: hashedPassword,
        role: { role: "ADMIN" },
      } as any);

      await expect(
        LoggingIn({ email: "admin@test.com", password: "wrong-password" })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: "Credenciais inválidas",
      });
    });

    it("3. deve falhar autenticação se o usuário não for encontrado ou estiver deletado", async () => {
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue(null as any);

      await expect(
        LoggingIn({ email: "unknown@test.com", password: "password123" })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: "Credenciais inválidas",
      });
    });
  });

  describe("registerSellerWithToken", () => {
    it("4. deve registrar vendedor com convite válido com sucesso", async () => {
      const mockTx = {
        enterpriseInviteToken: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: "tok-1",
            token: "valid-token",
            enterpriseId: "ent-1",
            maxUses: 5,
            canceledAt: null,
            expiredAt: new Date(Date.now() + 100000),
          }),
          update: jest.fn(),
        },
        userToken: {
          count: jest.fn<any>().mockResolvedValue(1),
          create: jest.fn<any>().mockResolvedValue({}),
        },
        user: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue({
            id: "seller-1",
            name: "Novo Vendedor",
            email: "seller@test.com",
            enterpriseId: "ent-1",
          }),
        },
        userRole: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: "role-seller-id" }),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      const result = await registerSellerWithToken({
        token: "valid-token",
        name: "Novo Vendedor",
        email: "seller@test.com",
        password: "password123",
      });

      expect(result).toHaveProperty("token");
      expect(result.user.id).toBe("seller-1");
      expect(result.user.role).toBe("SELLER");
      expect(mockTx.userToken.create).toHaveBeenCalledWith({
        data: { userId: "seller-1", tokenId: "tok-1" },
      });
      expect(mockTx.enterpriseInviteToken.update).not.toHaveBeenCalled();
    });

    it("5. deve auto-cancelar token quando atingir o limite maxUses", async () => {
      const mockTx = {
        enterpriseInviteToken: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: "tok-1",
            token: "valid-token",
            enterpriseId: "ent-1",
            maxUses: 2,
            canceledAt: null,
            expiredAt: new Date(Date.now() + 100000),
          }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
        userToken: {
          count: jest.fn<any>().mockResolvedValue(1), // 1 use previously, this is use #2
          create: jest.fn<any>().mockResolvedValue({}),
        },
        user: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue({
            id: "seller-2",
            name: "Vendedor",
            email: "seller2@test.com",
            enterpriseId: "ent-1",
          }),
        },
        userRole: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: "role-seller-id" }),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      await registerSellerWithToken({
        token: "valid-token",
        name: "Vendedor",
        email: "seller2@test.com",
        password: "password123",
      });

      expect(mockTx.enterpriseInviteToken.update).toHaveBeenCalledWith({
        where: { id: "tok-1" },
        data: { canceledAt: expect.any(Date) },
      });
    });

    it("6. deve lançar erro se o convite for inexistente, cancelado ou expirado", async () => {
      const mockTx = {
        enterpriseInviteToken: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        registerSellerWithToken({
          token: "invalid-token",
          name: "Vendedor",
          email: "seller@test.com",
          password: "password123",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Convite inválido ou indisponível",
      });
    });

    it("7. deve lançar erro se o e-mail já estiver cadastrado", async () => {
      const mockTx = {
        enterpriseInviteToken: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: "tok-1",
            token: "valid-token",
            enterpriseId: "ent-1",
            maxUses: 5,
            canceledAt: null,
            expiredAt: new Date(Date.now() + 100000),
          }),
        },
        userToken: {
          count: jest.fn<any>().mockResolvedValue(0),
        },
        user: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: "existing-user" }),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        registerSellerWithToken({
          token: "valid-token",
          name: "Vendedor",
          email: "already@used.com",
          password: "password123",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "E-mail já está em uso",
      });
    });
  });
});
