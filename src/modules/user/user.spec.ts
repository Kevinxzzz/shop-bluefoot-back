import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
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
    await prisma.productMedia.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.category.deleteMany();
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

  describe("GET /users - List Users by Enterprise", () => {
    let otherEnterpriseId: string;
    let otherAdminToken: string;

    beforeEach(async () => {
      // Criar outra empresa e outro usuário para testar isolamento (multi-tenant)
      const otherEnterprise = await prisma.enterprise.create({
        data: {
          cnpj: "00000000000000",
          name: "Outra Empresa",
          phoneNumber: "888888888",
        },
      });
      otherEnterpriseId = otherEnterprise.id;

      const adminRole = await prisma.userRole.findFirst({ where: { role: "ADMIN" } });

      const otherAdmin = await prisma.user.create({
        data: {
          name: "Outro Admin",
          email: "outro_admin@test.com",
          password: "password123",
          roleId: adminRole!.id,
          enterpriseId: otherEnterpriseId,
        },
      });

      otherAdminToken = jwt.sign(
        { userId: otherAdmin.id, email: otherAdmin.email, role: "ADMIN", enterpriseId: otherEnterpriseId },
        env.JWT_SECRET
      );

      const sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });

      // Criar um usuário já inativo na empresa principal para testar o status INACTIVE
      await prisma.user.create({
        data: {
          name: "Inactive User",
          email: "inactive@test.com",
          password: "password123",
          roleId: sellerRole!.id,
          enterpriseId: enterpriseId,
          deletedAt: new Date(),
        },
      });
    });


    it("should allow ADMIN to list users of their own enterprise", async () => {
      const response = await request(app)
        .get("/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3); // adminUser (ativo), sellerUser (ativo) e Inactive User (inativo)

      const activeUser = response.body.find((u: any) => u.id === adminUser.id);
      expect(activeUser).toBeTruthy();
      expect(activeUser.status).toBe("ACTIVE");
      expect(activeUser.deletedAt).toBeNull();
      expect(activeUser.role).toBe("ADMIN");

      const inactiveUser = response.body.find((u: any) => u.email === "inactive@test.com");
      expect(inactiveUser).toBeTruthy();
      expect(inactiveUser.status).toBe("INACTIVE");
      expect(inactiveUser.deletedAt).not.toBeNull();
      expect(inactiveUser.role).toBe("SELLER");
    });

    it("should forbid SELLER from listing users", async () => {
      const response = await request(app)
        .get("/users")
        .set("Authorization", `Bearer ${sellerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Acesso negado");
    });

    it("should only list users from the authenticated user's enterprise", async () => {
      const response = await request(app)
        .get("/users")
        .set("Authorization", `Bearer ${otherAdminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1); // apenas o outro admin

      expect(response.body[0].id).not.toBe(adminUser.id);
      expect(response.body[0].id).not.toBe(sellerUser.id);
      expect(response.body[0].email).toBe("outro_admin@test.com");
    });
  });

  describe("PATCH /users/:id/role - Update User Role", () => {
    it("should allow an ADMIN to change another user's role", async () => {
      const response = await request(app)
        .patch(`/users/${sellerUser.id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "ADMIN" });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe("ADMIN");

      const updatedUser = await prisma.user.findUnique({
        where: { id: sellerUser.id },
        include: { role: true },
      });
      expect(updatedUser?.role.role).toBe("ADMIN");
    });

    it("should forbid a SELLER from changing a role", async () => {
      const response = await request(app)
        .patch(`/users/${sellerUser.id}/role`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ role: "ADMIN" });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Acesso negado");
    });

    it("should fail if ADMIN tries to change a user from another enterprise", async () => {
      const otherEnterprise = await prisma.enterprise.create({
        data: { cnpj: "00000000000001", name: "Other", phoneNumber: "777777777" },
      });
      const sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
      const otherUser = await prisma.user.create({
        data: {
          name: "Other User",
          email: "other_seller@test.com",
          password: "pwd",
          roleId: sellerRole!.id,
          enterpriseId: otherEnterprise.id,
        },
      });

      const response = await request(app)
        .patch(`/users/${otherUser.id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "ADMIN" });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Usuário não encontrado");
    });

    it("should fail if trying to update a soft deleted user", async () => {
      await prisma.user.update({
        where: { id: sellerUser.id },
        data: { deletedAt: new Date() },
      });

      const response = await request(app)
        .patch(`/users/${sellerUser.id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "ADMIN" });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Usuário não encontrado");
    });

    it("should fail if role is invalid", async () => {
      const response = await request(app)
        .patch(`/users/${sellerUser.id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "SUPERADMIN" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Erro de validação");
    });

    it("should fail if user already has the requested role", async () => {
      const response = await request(app)
        .patch(`/users/${sellerUser.id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "SELLER" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Usuário já possui esta role");
    });

    it("should fail if ADMIN tries to change their own role", async () => {
      const response = await request(app)
        .patch(`/users/${adminUser.id}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "SELLER" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Você não pode alterar sua própria role");
    });

    it("should fail if secondary ADMIN tries to change the founder admin's role", async () => {
      // Criar admin secundário
      const adminRole = await prisma.userRole.findFirst({ where: { role: "ADMIN" } });
      const secondaryAdmin = await prisma.user.create({
        data: {
          name: "Secondary Admin",
          email: "secadmin@test.com",
          password: "pwd",
          roleId: adminRole!.id,
          enterpriseId,
        },
      });

      const secondaryToken = jwt.sign(
        { userId: secondaryAdmin.id, email: secondaryAdmin.email, role: "ADMIN", enterpriseId },
        env.JWT_SECRET
      );

      const response = await request(app)
        .patch(`/users/${adminUser.id}/role`) // tentando alterar o adminUser (que é o founder criado no beforeEach)
        .set("Authorization", `Bearer ${secondaryToken}`)
        .send({ role: "SELLER" });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("O administrador fundador da empresa não pode ter o cargo alterado");
    });
  });

  describe("PATCH /users/profile - Update User Profile", () => {
    it("should allow a user to update their own profile", async () => {
      const response = await request(app)
        .patch("/users/profile")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          name: "Novo Nome Seller",
          contactLink: "https://wa.me/55999999999",
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Novo Nome Seller");
      expect(response.body.contactLink).toBe("https://wa.me/55999999999");
      expect(response.body.email).toBe(sellerUser.email);
    });

    it("should fail if no data is provided", async () => {
      const response = await request(app)
        .patch("/users/profile")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Nenhum dado fornecido para atualização");
    });

    it("should fail if trying to update unallowed fields like roleId or password", async () => {
      const response = await request(app)
        .patch("/users/profile")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          name: "Hacker",
          roleId: "admin-role-id",
          password: "newpassword123"
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Erro de validação");
    });

    it("should fail if email is already in use by another user", async () => {
      const response = await request(app)
        .patch("/users/profile")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          email: adminUser.email, // Tentando usar o email do admin
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("E-mail já está em uso");
    });

    it("should fail if contactLink is already in use by another user", async () => {
      // Set admin contactLink
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { contactLink: "https://wa.me/5511111111" }
      });

      const response = await request(app)
        .patch("/users/profile")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          contactLink: "https://wa.me/5511111111", // Tentando usar o contato do admin
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("Link de contato já está em uso");
    });

    it("should allow update if contactLink and email are the same as current", async () => {
      const response = await request(app)
        .patch("/users/profile")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          email: sellerUser.email,
        });

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(sellerUser.email);
    });
  });

  describe("GET /users/enterprise-martins - Public Users Route", () => {
    let originalId: string;
    beforeEach(() => {
      // Mock env object directly instead of process.env
      originalId = env.ID_ENTERPRISE_MARTINS;
      env.ID_ENTERPRISE_MARTINS = enterpriseId;
    });

    afterEach(() => {
      env.ID_ENTERPRISE_MARTINS = originalId;
    });

    it("should return users of the Martins enterprise with public fields only", async () => {
      // Adicionar produto para o admin (deletedAt: null) -> account: 1
      await prisma.product.create({
        data: {
          name: "Produto 1",
          price: 100,
          userId: adminUser.id,
          enterpriseId,
        }
      });

      // Adicionar produto soft-deleted para o admin (não deve contar)
      await prisma.product.create({
        data: {
          name: "Produto Deletado",
          price: 50,
          userId: adminUser.id,
          enterpriseId,
          deletedAt: new Date(),
        }
      });

      // O seller (criado no beforeEach principal) não tem produtos -> account: 0
      
      const response = await request(app).get("/users/enterprise-martins");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Tem 2 usuários (admin e seller)
      expect(response.body.length).toBe(2);

      const admin = response.body.find((u: any) => u.id === adminUser.id);
      expect(admin).toBeDefined();
      expect(admin.name).toBe(adminUser.name);
      expect(admin.imageUrl).toBe(adminUser.profileImageUrl || null);
      expect(admin.productsCount).toBe(1);
      
      // Validar que NENHUM campo sensível foi retornado
      expect(admin.email).toBeUndefined();
      expect(admin.password).toBeUndefined();
      expect(admin.roleId).toBeUndefined();
      expect(admin.enterpriseId).toBeUndefined();
      expect(admin.contactLink).toBeUndefined();
      expect(admin.createdAt).toBeUndefined();
      expect(admin.deletedAt).toBeUndefined();

      const seller = response.body.find((u: any) => u.id === sellerUser.id);
      expect(seller).toBeDefined();
      expect(seller.productsCount).toBe(0);
    });

    it("should return empty array if enterprise has no users (or doesn't exist)", async () => {
      env.ID_ENTERPRISE_MARTINS = "invalid-or-empty-enterprise-id";

      const response = await request(app).get("/users/enterprise-martins");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it("should not return users from other enterprises", async () => {
      const otherEnterprise = await prisma.enterprise.create({
        data: { cnpj: "00000000000002", name: "Other", phoneNumber: "666666666" },
      });
      const sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
      
      await prisma.user.create({
        data: {
          name: "Other User",
          email: "other_user_2@test.com",
          password: "pwd",
          roleId: sellerRole!.id,
          enterpriseId: otherEnterprise.id,
        },
      });

      const response = await request(app).get("/users/enterprise-martins");

      expect(response.status).toBe(200);
      // Deve retornar apenas os 2 da empresa martins
      expect(response.body.length).toBe(2);
      const otherUser = response.body.find((u: any) => u.email === "other_user_2@test.com");
      expect(otherUser).toBeUndefined();
    });
    
    it("should return 500 if ID_ENTERPRISE_MARTINS is not set in env", async () => {
      (env as any).ID_ENTERPRISE_MARTINS = "";

      const response = await request(app).get("/users/enterprise-martins");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("A loja pública não está configurada corretamente (Falta ID_ENTERPRISE_MARTINS).");
    });
  });

  describe("GET /users/enterprise-martins/:id - Public User by ID", () => {
    let originalId: string;
    beforeEach(() => {
      originalId = env.ID_ENTERPRISE_MARTINS;
      env.ID_ENTERPRISE_MARTINS = enterpriseId;
    });

    afterEach(() => {
      env.ID_ENTERPRISE_MARTINS = originalId;
    });

    it("should return public details of a seller and their active products", async () => {
      await prisma.product.create({
        data: {
          name: "Produto Ativo",
          price: 100,
          userId: sellerUser.id,
          enterpriseId,
        }
      });

      await prisma.product.create({
        data: {
          name: "Produto Deletado",
          price: 50,
          userId: sellerUser.id,
          enterpriseId,
          deletedAt: new Date(),
        }
      });

      const response = await request(app).get(`/users/enterprise-martins/${sellerUser.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(sellerUser.id);
      expect(response.body.name).toBe(sellerUser.name);
      expect(Array.isArray(response.body.products)).toBe(true);
      expect(response.body.products.length).toBe(1);
      expect(response.body.products[0].name).toBe("Produto Ativo");

      expect(response.body.email).toBeUndefined();
      expect(response.body.password).toBeUndefined();
      expect(response.body.roleId).toBeUndefined();
      expect(response.body.enterpriseId).toBeUndefined();
      expect(response.body.createdAt).toBeUndefined();
      expect(response.body.deletedAt).toBeUndefined();
    });

    it("should return 404 if the seller does not exist", async () => {
      const randomUuid = "123e4567-e89b-12d3-a456-426614174000";
      const response = await request(app).get(`/users/enterprise-martins/${randomUuid}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Vendedor não encontrado");
    });

    it("should return 404 if the seller belongs to another enterprise", async () => {
      const otherEnterprise = await prisma.enterprise.create({
        data: { cnpj: "00000000000003", name: "Other", phoneNumber: "555555555" },
      });
      const sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
      
      const otherUser = await prisma.user.create({
        data: {
          name: "Other User",
          email: "other_user_3@test.com",
          password: "pwd",
          roleId: sellerRole!.id,
          enterpriseId: otherEnterprise.id,
        },
      });

      const response = await request(app).get(`/users/enterprise-martins/${otherUser.id}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Vendedor não encontrado");
    });

    it("should return 404 if the seller is soft deleted", async () => {
      await prisma.user.update({
        where: { id: sellerUser.id },
        data: { deletedAt: new Date() },
      });

      const response = await request(app).get(`/users/enterprise-martins/${sellerUser.id}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Vendedor não encontrado");
    });

    it("should return 400 if the ID is not a valid UUID", async () => {
      const response = await request(app).get(`/users/enterprise-martins/not-a-uuid`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Erro de validação");
    });
  });
});

