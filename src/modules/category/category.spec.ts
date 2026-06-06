import { describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { app } from "../../app.js";
import { prisma } from "../../shared/database/prisma.js";
import { env } from "../../shared/config/env.js";
import { generateSlug } from "./category.service.js";

describe("Category Module", () => {
  let enterpriseId: string;
  let adminToken: string;
  let sellerToken: string;
  let adminUser: any;
  let sellerUser: any;
  let secondEnterpriseId: string;
  let secondAdminToken: string;

  beforeEach(async () => {
    // Limpar tabelas
    await prisma.productCategory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();

    // Roles
    let adminRole = await prisma.userRole.findFirst({ where: { role: "ADMIN" } });
    if (!adminRole) {
      adminRole = await prisma.userRole.create({ data: { role: "ADMIN", description: "Admin" } });
    }

    let sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
    if (!sellerRole) {
      sellerRole = await prisma.userRole.create({ data: { role: "SELLER", description: "Seller" } });
    }

    // Criar empresa 1
    const enterprise = await prisma.enterprise.create({
      data: { cnpj: "12345678901234", name: "Empresa 1", phoneNumber: "999999999" },
    });
    enterpriseId = enterprise.id;

    // Criar empresa 2
    const secondEnterprise = await prisma.enterprise.create({
      data: { cnpj: "12345678901235", name: "Empresa 2", phoneNumber: "999999998" },
    });
    secondEnterpriseId = secondEnterprise.id;

    // Criar admin da Empresa 1
    const hashedPassword = await bcrypt.hash("password123", 10);
    adminUser = await prisma.user.create({
      data: { name: "Admin 1", email: "admin1@test.com", password: hashedPassword, roleId: adminRole.id, enterpriseId },
    });

    // Criar seller da Empresa 1
    sellerUser = await prisma.user.create({
      data: { name: "Seller 1", email: "seller1@test.com", password: hashedPassword, roleId: sellerRole.id, enterpriseId },
    });

    // Criar admin da Empresa 2
    const secondAdminUser = await prisma.user.create({
      data: { name: "Admin 2", email: "admin2@test.com", password: hashedPassword, roleId: adminRole.id, enterpriseId: secondEnterpriseId },
    });

    // Gerar tokens
    adminToken = jwt.sign(
      { userId: adminUser.id, email: adminUser.email, role: adminRole.role, enterpriseId },
      env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    sellerToken = jwt.sign(
      { userId: sellerUser.id, email: sellerUser.email, role: sellerRole.role, enterpriseId },
      env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    secondAdminToken = jwt.sign(
      { userId: secondAdminUser.id, email: secondAdminUser.email, role: adminRole.role, enterpriseId: secondEnterpriseId },
      env.JWT_SECRET,
      { expiresIn: "1d" }
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Slug normalization", () => {
    it("should normalize complex strings to valid slugs", () => {
      expect(generateSlug(" Eletrônicos Gamer ")).toBe("eletronicos-gamer");
      expect(generateSlug("Ação & Aventura!!")).toBe("acao-aventura");
      expect(generateSlug("  MUITOS   ESPAÇOS  ")).toBe("muitos-espacos");
    });
  });

  describe("POST /categories", () => {
    it("should allow ADMIN to create a category", async () => {
      const res = await request(app)
        .post("/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: " Eletrônicos Gamer " });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Eletrônicos Gamer");
      expect(res.body.slug).toBe("eletronicos-gamer");
      expect(res.body.enterpriseId).toBe(enterpriseId);
    });

    it("should not allow SELLER to create a category", async () => {
      const res = await request(app)
        .post("/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ name: "Teste" });

      expect(res.status).toBe(403);
    });

    it("should return 400 if slug conflicts in the same enterprise", async () => {
      await request(app)
        .post("/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Eletronicos" });

      const res = await request(app)
        .post("/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "ELETRÔNICOS" }); // Will generate 'eletronicos'

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Categoria já existe");
    });

    it("should allow the same slug in different enterprises", async () => {
      await request(app)
        .post("/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Eletrônicos" });

      const res = await request(app)
        .post("/categories")
        .set("Authorization", `Bearer ${secondAdminToken}`)
        .send({ name: "Eletrônicos" });

      expect(res.status).toBe(201);
    });
  });

  describe("GET /categories", () => {
    it("should list categories with pagination and counts", async () => {
      await prisma.category.createMany({
        data: Array.from({ length: 5 }).map((_, i) => ({
          name: `Cat ${i}`,
          slug: `cat-${i}`,
          enterpriseId,
        })),
      });

      const res = await request(app)
        .get("/categories?page=1&limit=2")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(5);
      expect(res.body.meta.totalPages).toBe(3);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.data[0]).toHaveProperty("productsCount");
      expect(res.body.data[0]).toHaveProperty("status", "ACTIVE");
    });

    it("should filter categories by status (ACTIVE, DELETED, ALL)", async () => {
      await prisma.category.create({ data: { name: "Active Cat", slug: "active-cat", enterpriseId } });
      await prisma.category.create({ data: { name: "Deleted Cat", slug: "del-cat", enterpriseId, deletedAt: new Date() } });

      const resActive = await request(app).get("/categories?status=ACTIVE").set("Authorization", `Bearer ${adminToken}`);
      expect(resActive.body.data.length).toBeGreaterThan(0);
      expect(resActive.body.data.every((c: any) => c.status === "ACTIVE")).toBe(true);

      const resDeleted = await request(app).get("/categories?status=DELETED").set("Authorization", `Bearer ${adminToken}`);
      expect(resDeleted.body.data.length).toBe(1);
      expect(resDeleted.body.data[0].status).toBe("DELETED");

      const resAll = await request(app).get("/categories?status=ALL").set("Authorization", `Bearer ${adminToken}`);
      expect(resAll.body.data.length).toBeGreaterThan(resActive.body.data.length);
    });

    it("should not list categories from another enterprise", async () => {
      await prisma.category.create({
        data: { name: "Cat E2", slug: "cat-e2", enterpriseId: secondEnterpriseId },
      });

      const res = await request(app)
        .get("/categories")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe("PATCH /categories/:id", () => {
    it("should update a category", async () => {
      const category = await prisma.category.create({
        data: { name: "Antigo", slug: "antigo", enterpriseId },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Novo Nome" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Novo Nome");
      expect(res.body.slug).toBe("novo-nome");
    });

    it("should block update from another enterprise (cross-tenant)", async () => {
      const category = await prisma.category.create({
        data: { name: "Cat E2", slug: "cat-e2", enterpriseId: secondEnterpriseId },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Hacked" });

      expect(res.status).toBe(404);
    });

    it("should block update if new slug conflicts", async () => {
      await prisma.category.create({
        data: { name: "Cat 1", slug: "cat-1", enterpriseId },
      });
      const category2 = await prisma.category.create({
        data: { name: "Cat 2", slug: "cat-2", enterpriseId },
      });

      const res = await request(app)
        .patch(`/categories/${category2.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Cat 1" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Categoria já existe");
    });

    it("should block update if category is in trash", async () => {
      const category = await prisma.category.create({
        data: { name: "Deleted", slug: "deleted-1", enterpriseId, deletedAt: new Date() },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Revive" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Categoria está na lixeira");
    });
  });

  describe("PATCH /categories/:id/archive (Soft Delete)", () => {
    it("should soft delete an empty category", async () => {
      const category = await prisma.category.create({
        data: { name: "To Delete", slug: "to-delete", enterpriseId },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}/archive`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const dbCategory = await prisma.category.findUnique({ where: { id: category.id } });
      expect(dbCategory?.deletedAt).not.toBeNull();
    });

    it("should block delete if category has active products", async () => {
      const category = await prisma.category.create({
        data: { name: "With Product", slug: "with-product", enterpriseId },
      });

      const product = await prisma.product.create({
        data: { name: "Prod 1", userId: adminUser.id, enterpriseId },
      });

      await prisma.productCategory.create({
        data: { categoryId: category.id, productId: product.id },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}/archive`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Categoria possui produtos vinculados");
    });

    it("should allow delete if products are soft-deleted", async () => {
      const category = await prisma.category.create({
        data: { name: "With Deleted Product", slug: "with-del-product", enterpriseId },
      });

      const product = await prisma.product.create({
        data: { name: "Prod 1", userId: adminUser.id, enterpriseId, deletedAt: new Date() },
      });

      await prisma.productCategory.create({
        data: { categoryId: category.id, productId: product.id },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}/archive`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it("should block delete from another enterprise (cross-tenant)", async () => {
      const category = await prisma.category.create({
        data: { name: "Cat E2", slug: "cat-e2", enterpriseId: secondEnterpriseId },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}/archive`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /categories/:id/restore", () => {
    it("should restore a soft-deleted category", async () => {
      const category = await prisma.category.create({
        data: { name: "To Restore", slug: "to-restore", enterpriseId, deletedAt: new Date() },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}/restore`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const dbCategory = await prisma.category.findUnique({ where: { id: category.id } });
      expect(dbCategory?.deletedAt).toBeNull();
    });

    it("should block restore if category is already active", async () => {
      const category = await prisma.category.create({
        data: { name: "Active Restore", slug: "active-restore", enterpriseId },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}/restore`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("A categoria não está arquivada");
    });

    it("should block restore from another enterprise", async () => {
      const category = await prisma.category.create({
        data: { name: "Cat E2 Restore", slug: "cat-e2-restore", enterpriseId: secondEnterpriseId, deletedAt: new Date() },
      });

      const res = await request(app)
        .patch(`/categories/${category.id}/restore`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /categories/:id (Hard Delete)", () => {
    it("should permanently delete a soft-deleted category", async () => {
      const category = await prisma.category.create({
        data: { name: "Trash", slug: "trash", enterpriseId, deletedAt: new Date() },
      });

      const res = await request(app)
        .delete(`/categories/${category.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const dbCategory = await prisma.category.findUnique({ where: { id: category.id } });
      expect(dbCategory).toBeNull();
    });

    it("should block hard delete if category is ACTIVE", async () => {
      const category = await prisma.category.create({
        data: { name: "Active", slug: "active", enterpriseId },
      });

      const res = await request(app)
        .delete(`/categories/${category.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("A categoria deve estar arquivada para ser excluída permanentemente");
    });

    it("should block hard delete if category has active products", async () => {
      const category = await prisma.category.create({
        data: { name: "Trash With Product", slug: "trash-prod", enterpriseId, deletedAt: new Date() },
      });

      const product = await prisma.product.create({
        data: { name: "Prod Active", userId: adminUser.id, enterpriseId },
      });

      await prisma.productCategory.create({
        data: { categoryId: category.id, productId: product.id },
      });

      const res = await request(app)
        .delete(`/categories/${category.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
    });
  });
});
