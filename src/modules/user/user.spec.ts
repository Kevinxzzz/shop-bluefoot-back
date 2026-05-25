import { describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { app } from "../../app.js";
import { prisma } from "../../shared/database/prisma.js";
import { env } from "../../shared/config/env.js";

describe("User Module", () => {
  let enterpriseId: string;
  let adminToken: string;
  let sellerToken: string;
  let adminUser: any;
  let sellerUser: any;

  beforeEach(async () => {
    // Limpar tabelas mantendo as roles
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();

    // Obter ou criar as roles
    let adminRole = await prisma.userRole.findFirst({ where: { role: "ADMIN" } });
    if (!adminRole) {
      adminRole = await prisma.userRole.create({
        data: { role: "ADMIN", description: "Administrador da Empresa" },
      });
    }

    let sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
    if (!sellerRole) {
      sellerRole = await prisma.userRole.create({
        data: { role: "SELLER", description: "Vendedor da Empresa" },
      });
    }

    // Criar empresa
    const enterprise = await prisma.enterprise.create({
      data: {
        cnpj: "12345678901234",
        name: "Empresa de Teste",
        phoneNumber: "999999999",
      },
    });
    enterpriseId = enterprise.id;

    // Criar admin
    const hashedPassword = await bcrypt.hash("password123", 10);
    adminUser = await prisma.user.create({
      data: {
        name: "Admin User",
        email: "admin@test.com",
        password: hashedPassword,
        roleId: adminRole!.id,
        enterpriseId,
      },
    });

    // Criar seller
    sellerUser = await prisma.user.create({
      data: {
        name: "Seller User",
        email: "seller@test.com",
        password: hashedPassword,
        roleId: sellerRole!.id,
        enterpriseId,
      },
    });

    // Assinar tokens de autenticação
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: "ADMIN", enterpriseId },
      env.JWT_SECRET
    );

    sellerToken = jwt.sign(
      { userId: sellerUser.id, email: sellerUser.email, role: "SELLER", enterpriseId },
      env.JWT_SECRET
    );
  });

  describe("POST /users/invite - Generate Invite Token", () => {
    it("should allow an ADMIN to generate an invite token", async () => {
      const response = await request(app)
        .post("/users/invite")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          maxUses: 5,
          expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("token");
      expect(response.body.maxUses).toBe(5);
      expect(response.body.enterpriseId).toBe(enterpriseId);
      expect(response.body.createdByAdminId).toBe(adminUser.id);
    });

    it("should forbid a SELLER from generating an invite token", async () => {
      const response = await request(app)
        .post("/users/invite")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          maxUses: 5,
          expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Acesso negado");
    });

    it("should fail validation if expiredAt is not a valid ISO date", async () => {
      const response = await request(app)
        .post("/users/invite")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          maxUses: 5,
          expiredAt: "invalid-date",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Erro de validação");
    });
  });

  describe("POST /users/register/invite - Register with Invite", () => {
    let inviteToken: string;
    let inviteId: string;

    beforeEach(async () => {
      // Gerar um token de convite válido usando o service direto
      const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const inviteRecord = await prisma.$transaction(async (tx) => {
        const invite = await tx.enterpriseInviteToken.create({
          data: {
            token: "temp",
            maxUses: 2,
            expiredAt,
            enterpriseId,
            createdByAdminId: adminUser.id,
          },
        });
        const token = jwt.sign({ inviteTokenId: invite.id, enterpriseId }, env.JWT_SECRET);
        return await tx.enterpriseInviteToken.update({
          where: { id: invite.id },
          data: { token },
        });
      });
      inviteToken = inviteRecord.token;
      inviteId = inviteRecord.id;
    });

    it("should register a new user as a SELLER with a valid invite token", async () => {
      const response = await request(app)
        .post("/users/register/invite")
        .send({
          inviteToken,
          name: "Novo Vendedor",
          email: "new_seller@test.com",
          password: "password123",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("token");
      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user.email).toBe("new_seller@test.com");
      expect(response.body.user.role).toBe("SELLER");

      // Verificar no banco
      const user = await prisma.user.findUnique({
        where: { email: "new_seller@test.com" },
        include: { role: true, usedTokens: true },
      });
      expect(user).toBeTruthy();
      expect(user?.role.role).toBe("SELLER");
      expect(user?.enterpriseId).toBe(enterpriseId);
      expect(user?.usedTokens[0].tokenId).toBe(inviteId);

      // O token gerado deve ser válido para autenticar o novo vendedor
      const decoded = jwt.verify(response.body.token, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe(user?.id);
      expect(decoded.role).toBe("SELLER");
      expect(decoded.enterpriseId).toBe(enterpriseId);
    });

    it("should fail registration with an invalid JWT signature invite token", async () => {
      const invalidSignatureToken = jwt.sign(
        { inviteTokenId: inviteId, enterpriseId },
        "wrong-secret"
      );

      const response = await request(app)
        .post("/users/register/invite")
        .send({
          inviteToken: invalidSignatureToken,
          name: "Novo Vendedor",
          email: "new_seller@test.com",
          password: "password123",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Token de convite inválido ou mal formatado");
    });

    it("should fail registration if the invite token does not exist in db", async () => {
      const nonExistentToken = jwt.sign(
        { inviteTokenId: "00000000-0000-0000-0000-000000000000", enterpriseId },
        env.JWT_SECRET
      );

      const response = await request(app)
        .post("/users/register/invite")
        .send({
          inviteToken: nonExistentToken,
          name: "Novo Vendedor",
          email: "new_seller@test.com",
          password: "password123",
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Token de convite não encontrado");
    });

    it("should fail registration if the invite token is canceled", async () => {
      await prisma.enterpriseInviteToken.update({
        where: { id: inviteId },
        data: { canceledAt: new Date() },
      });

      const response = await request(app)
        .post("/users/register/invite")
        .send({
          inviteToken,
          name: "Novo Vendedor",
          email: "new_seller@test.com",
          password: "password123",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Este convite foi cancelado");
    });

    it("should fail registration if the invite token is expired", async () => {
      await prisma.enterpriseInviteToken.update({
        where: { id: inviteId },
        data: { expiredAt: new Date(Date.now() - 1000) }, // expirado há 1 segundo
      });

      const response = await request(app)
        .post("/users/register/invite")
        .send({
          inviteToken,
          name: "Novo Vendedor",
          email: "new_seller@test.com",
          password: "password123",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Este convite está expirado");
    });

    it("should fail registration if the invite token reaches max uses", async () => {
      // Usar o convite 2 vezes (limite máximo definido no setup é 2)
      const sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });

      for (let i = 0; i < 2; i++) {
        const u = await prisma.user.create({
          data: {
            name: `User ${i}`,
            email: `user_${i}@test.com`,
            password: "password123",
            roleId: sellerRole!.id,
            enterpriseId,
          },
        });
        await prisma.userToken.create({
          data: {
            userId: u.id,
            tokenId: inviteId,
          },
        });
      }

      const response = await request(app)
        .post("/users/register/invite")
        .send({
          inviteToken,
          name: "Novo Vendedor",
          email: "new_seller@test.com",
          password: "password123",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Este convite atingiu o limite máximo de usos");
    });

    it("should fail registration if email is already in use", async () => {
      const response = await request(app)
        .post("/users/register/invite")
        .send({
          inviteToken,
          name: "Novo Vendedor",
          email: "seller@test.com", // email já usado na beforeEach
          password: "password123",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("E-mail já está em uso");
    });
  });
});
