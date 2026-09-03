import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  createInviteToken,
  revokeInviteToken,
  listTokens,
  validateInviteToken,
} from "./token.service.js";
import { prisma } from "../../shared/database/prisma.js";
import {
  createTokenSchema,
  revokeTokenSchema,
  validateTokenSchema,
} from "./token.schema.js";

describe("Token Module", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("Zod Schemas", () => {
    it("deve validar payload correto de criação de token", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const parsed = createTokenSchema.safeParse({
        maxUses: 5,
        expiredAt: futureDate,
      });
      expect(parsed.success).toBe(true);
    });

    it("deve rejeitar maxUses <= 0", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const parsedZero = createTokenSchema.safeParse({
        maxUses: 0,
        expiredAt: futureDate,
      });
      expect(parsedZero.success).toBe(false);

      const parsedNegative = createTokenSchema.safeParse({
        maxUses: -1,
        expiredAt: futureDate,
      });
      expect(parsedNegative.success).toBe(false);
    });

    it("deve rejeitar data de expiração no passado", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const parsed = createTokenSchema.safeParse({
        maxUses: 5,
        expiredAt: pastDate,
      });
      expect(parsed.success).toBe(false);
    });

    it("deve validar UUID em revokeTokenSchema", () => {
      expect(
        revokeTokenSchema.safeParse({ id: "123e4567-e89b-12d3-a456-426614174000" })
          .success
      ).toBe(true);
      expect(revokeTokenSchema.safeParse({ id: "invalid-uuid" }).success).toBe(
        false
      );
    });

    it("deve validar tamanho mínimo em validateTokenSchema", () => {
      expect(
        validateTokenSchema.safeParse({ rawToken: "1234567890abcdef" }).success
      ).toBe(true);
      expect(validateTokenSchema.safeParse({ rawToken: "short" }).success).toBe(
        false
      );
    });
  });

  describe("createInviteToken", () => {
    it("1. deve criar token de convite com sucesso", async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const mockCreated = {
        id: "tok-1",
        createdAt: new Date(),
        maxUses: 10,
      };

      jest
        .spyOn(prisma.enterpriseInviteToken, "create")
        .mockResolvedValue(mockCreated as any);

      const result = await createInviteToken({
        maxUses: 10,
        expiredAt: futureDate,
        enterpriseId: "ent-1",
        adminId: "admin-1",
      });

      expect(prisma.enterpriseInviteToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maxUses: 10,
          enterpriseId: "ent-1",
          createdByAdminId: "admin-1",
        }),
      });
      expect(result.id).toBe("tok-1");
      expect(typeof result.rawToken).toBe("string");
      expect(result.rawToken.length).toBe(64); // 32 bytes hex
    });
  });

  describe("revokeInviteToken", () => {
    it("2. deve revogar token ativo com sucesso", async () => {
      jest.spyOn(prisma.enterpriseInviteToken, "findFirst").mockResolvedValue({
        id: "tok-1",
        enterpriseId: "ent-1",
        canceledAt: null,
      } as any);

      jest
        .spyOn(prisma.enterpriseInviteToken, "update")
        .mockResolvedValue({ id: "tok-1" } as any);

      await revokeInviteToken("tok-1", "ent-1");

      expect(prisma.enterpriseInviteToken.update).toHaveBeenCalledWith({
        where: { id: "tok-1" },
        data: { canceledAt: expect.any(Date) },
      });
    });

    it("3. deve lançar 404 se token não existir ou já estiver cancelado", async () => {
      jest
        .spyOn(prisma.enterpriseInviteToken, "findFirst")
        .mockResolvedValue(null as any);

      await expect(revokeInviteToken("tok-invalid", "ent-1")).rejects.toMatchObject(
        {
          statusCode: 404,
          message: "Token não encontrado ou já revogado",
        }
      );
    });
  });

  describe("listTokens", () => {
    it("4. deve listar tokens com seus respectivos status computados", async () => {
      const now = new Date();
      const mockTokens = [
        {
          id: "tok-active",
          token: "raw-active",
          maxUses: 5,
          createdAt: now,
          expiredAt: new Date(now.getTime() + 100000),
          canceledAt: null,
          _count: { usedBy: 1 },
        },
        {
          id: "tok-canceled",
          token: "raw-canceled",
          maxUses: 5,
          createdAt: now,
          expiredAt: new Date(now.getTime() + 100000),
          canceledAt: new Date(),
          _count: { usedBy: 0 },
        },
        {
          id: "tok-expired",
          token: "raw-expired",
          maxUses: 5,
          createdAt: now,
          expiredAt: new Date(now.getTime() - 100000),
          canceledAt: null,
          _count: { usedBy: 0 },
        },
        {
          id: "tok-maxed",
          token: "raw-maxed",
          maxUses: 3,
          createdAt: now,
          expiredAt: new Date(now.getTime() + 100000),
          canceledAt: null,
          _count: { usedBy: 3 },
        },
      ];

      jest
        .spyOn(prisma.enterpriseInviteToken, "count")
        .mockResolvedValue(4 as any);
      jest
        .spyOn(prisma.enterpriseInviteToken, "findMany")
        .mockResolvedValue(mockTokens as any);

      const result = await listTokens("ent-1", 1, 10);

      expect(result.data[0].status).toBe("ACTIVE");
      expect(result.data[1].status).toBe("CANCELED");
      expect(result.data[2].status).toBe("EXPIRED");
      expect(result.data[3].status).toBe("MAXED_OUT");
      expect(result.meta.total).toBe(4);
    });
  });

  describe("validateInviteToken", () => {
    const futureDate = new Date(Date.now() + 86400000);

    it("5. deve validar token válido com sucesso", async () => {
      jest.spyOn(prisma.enterpriseInviteToken, "findFirst").mockResolvedValue({
        enterprise: { name: "Empresa XPTO" },
        _count: { usedBy: 2 },
        canceledAt: null,
        expiredAt: futureDate,
        maxUses: 5,
      } as any);

      const result = await validateInviteToken("valid-token");

      expect(result).toEqual({
        valid: true,
        enterpriseName: "Empresa XPTO",
        maxUses: 5,
        currentUses: 2,
        expiredAt: futureDate,
      });
    });

    it("6. deve rejeitar se token não existir", async () => {
      jest
        .spyOn(prisma.enterpriseInviteToken, "findFirst")
        .mockResolvedValue(null as any);

      await expect(validateInviteToken("not-found")).rejects.toMatchObject({
        statusCode: 400,
        message: "Convite inválido ou não encontrado",
      });
    });

    it("7. deve rejeitar se token foi cancelado", async () => {
      jest.spyOn(prisma.enterpriseInviteToken, "findFirst").mockResolvedValue({
        enterprise: { name: "Empresa XPTO" },
        _count: { usedBy: 0 },
        canceledAt: new Date(),
        expiredAt: futureDate,
        maxUses: 5,
      } as any);

      await expect(validateInviteToken("canceled-token")).rejects.toMatchObject({
        statusCode: 400,
        message: "Convite revogado",
      });
    });

    it("8. deve rejeitar se token estiver expirado", async () => {
      jest.spyOn(prisma.enterpriseInviteToken, "findFirst").mockResolvedValue({
        enterprise: { name: "Empresa XPTO" },
        _count: { usedBy: 0 },
        canceledAt: null,
        expiredAt: new Date(Date.now() - 1000),
        maxUses: 5,
      } as any);

      await expect(validateInviteToken("expired-token")).rejects.toMatchObject({
        statusCode: 400,
        message: "Convite expirado",
      });
    });

    it("9. deve rejeitar se limite de usos do token foi atingido", async () => {
      jest.spyOn(prisma.enterpriseInviteToken, "findFirst").mockResolvedValue({
        enterprise: { name: "Empresa XPTO" },
        _count: { usedBy: 5 },
        canceledAt: null,
        expiredAt: futureDate,
        maxUses: 5,
      } as any);

      await expect(validateInviteToken("maxed-token")).rejects.toMatchObject({
        statusCode: 400,
        message: "Limite de usos do convite atingido",
      });
    });
  });
});
