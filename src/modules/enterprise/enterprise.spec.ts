import { describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../app.js";
import { prisma } from "../../shared/database/prisma.js";
import { env } from "../../shared/config/env.js";

describe("Enterprise Module", () => {
  beforeEach(async () => {
    // Limpar tabelas mantendo as roles do setup
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();

    // Obter ou criar as roles
    let adminRole = await prisma.userRole.findFirst({ where: { role: "ADMIN" } });
    if (!adminRole) {
      await prisma.userRole.create({
        data: { role: "ADMIN", description: "Administrador da Empresa" },
      });
    }

    let sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
    if (!sellerRole) {
      await prisma.userRole.create({
        data: { role: "SELLER", description: "Vendedor da Empresa" },
      });
    }
  });

  const validEnterpriseData = {
    document: "12345678901234",
    name: "Empresa de Teste",
    phoneNumber: "11999999999",
    fantasyName: "Teste LTDA",
    contactLink: "https://wa.me/5511999999999",
    userName: "Admin Teste",
    userEmail: "admin@teste.com",
    userPassword: "password123",
  };

  it("should successfully register an enterprise and its first admin user", async () => {
    const response = await request(app)
      .post("/enterprise/register")
      .send(validEnterpriseData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("token");
    expect(response.body.enterprise).toHaveProperty("id");
    expect(response.body.enterprise.name).toBe(validEnterpriseData.name);
    expect(response.body.enterprise.cnpj).toBe(validEnterpriseData.document);
    expect(response.body.user).toHaveProperty("id");
    expect(response.body.user.email).toBe(validEnterpriseData.userEmail);
    expect(response.body.user.role).toBe("ADMIN");

    // Verificar no banco
    const dbEnterprise = await prisma.enterprise.findUnique({
      where: { cnpj: validEnterpriseData.document },
    });
    expect(dbEnterprise).toBeTruthy();

    const dbUser = await prisma.user.findUnique({
      where: { email: validEnterpriseData.userEmail },
      select: { role: { select: { role: true } }, enterpriseId: true },
    });
    expect(dbUser).toBeTruthy();
    expect(dbUser?.role.role).toBe("ADMIN");
  });

  it("should fail validation if contactLink is not a valid URL", async () => {
    const invalidData = {
      ...validEnterpriseData,
      contactLink: "not-a-url",
    };

    const response = await request(app)
      .post("/enterprise/register")
      .send(invalidData);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toContain("Erro de validação");
  });

  it("should fail validation if password is too short", async () => {
    const invalidData = {
      ...validEnterpriseData,
      userPassword: "123",
    };

    const response = await request(app)
      .post("/enterprise/register")
      .send(invalidData);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Erro de validação");
  });

  it("should fail to register if CNPJ is already in use", async () => {
    // Registrar primeiro
    await request(app)
      .post("/enterprise/register")
      .send(validEnterpriseData);

    // Tentar registrar outro com mesmo CNPJ
    const response = await request(app)
      .post("/enterprise/register")
      .send({
        ...validEnterpriseData,
        userEmail: "another-admin@teste.com",
        contactLink: "https://wa.me/5511888888888",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Empresa já cadastrada com este CNPJ");
  });

  it("should fail to register if email is already in use", async () => {
    // Registrar primeiro
    await request(app)
      .post("/enterprise/register")
      .send(validEnterpriseData);

    // Tentar registrar outro com mesmo email mas CNPJ diferente
    const response = await request(app)
      .post("/enterprise/register")
      .send({
        ...validEnterpriseData,
        document: "98765432109876",
        contactLink: "https://wa.me/5511888888888",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("E-mail já está em uso");
  });

  it("should fail to register if contactLink is already in use", async () => {
    // Registrar primeiro
    await request(app)
      .post("/enterprise/register")
      .send(validEnterpriseData);

    // Tentar registrar outro com mesmo contactLink
    const response = await request(app)
      .post("/enterprise/register")
      .send({
        ...validEnterpriseData,
        document: "98765432109876",
        userEmail: "another-admin@teste.com",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Link de contato já está em uso");
  });

  describe("GET /enterprise", () => {
    let adminToken: string;
    let sellerToken: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/enterprise/register")
        .send(validEnterpriseData);
      
      adminToken = res.body.token;
      const enterpriseId = res.body.enterprise.id;

      const sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
      const seller = await prisma.user.create({
        data: {
          name: "Seller Test",
          email: "seller@teste.com",
          password: "pwd",
          roleId: sellerRole!.id,
          enterpriseId,
        }
      });

      sellerToken = jwt.sign(
        { userId: seller.id, role: "SELLER", enterpriseId },
        env.JWT_SECRET,
        { expiresIn: "1d", algorithm: "HS256" }
      );
    });

    it("should allow ADMIN to get enterprise details", async () => {
      const response = await request(app)
        .get("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("name", validEnterpriseData.name);
      expect(response.body).toHaveProperty("document", validEnterpriseData.document);
      expect(response.body).toHaveProperty("phone");
      expect(response.body).toHaveProperty("salesGroupLink", null);
      // Ensure no extra fields like id or createdAt
      expect(response.body).not.toHaveProperty("id");
      expect(response.body).not.toHaveProperty("createdAt");
    });

    it("should allow SELLER to get enterprise details", async () => {
      const response = await request(app)
        .get("/enterprise")
        .set("Authorization", `Bearer ${sellerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("document", validEnterpriseData.document);
    });
  });

  describe("PUT /enterprise", () => {
    let adminToken: string;
    let sellerToken: string;
    let enterpriseId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/enterprise/register")
        .send(validEnterpriseData);
      
      adminToken = res.body.token;
      enterpriseId = res.body.enterprise.id;

      const sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
      const seller = await prisma.user.create({
        data: {
          name: "Seller Test",
          email: "seller@teste.com",
          password: "pwd",
          roleId: sellerRole!.id,
          enterpriseId,
        }
      });

      sellerToken = jwt.sign(
        { userId: seller.id, role: "SELLER", enterpriseId },
        env.JWT_SECRET,
        { expiresIn: "1d", algorithm: "HS256" }
      );
    });

    it("should allow ADMIN to update enterprise", async () => {
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New Name LTDA",
          phone: "11988888888",
          salesGroupLink: "https://t.me/newlink"
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("New Name LTDA");
      expect(response.body.phone).toBe("11988888888");
      expect(response.body.salesGroupLink).toBe("https://t.me/newlink");
    });

    it("should forbid SELLER from updating enterprise", async () => {
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ name: "Hacked" });

      expect(response.status).toBe(403);
    });

    it("should fail if payload is empty", async () => {
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Erro de validação");
    });

    it("should fail on invalid salesGroupLink URL", async () => {
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ salesGroupLink: "not-a-url" });

      expect(response.status).toBe(400);
    });

    it("should ignore fields outside DTO (like document)", async () => {
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Updated Name", document: "00000000000000" });

      expect(response.status).toBe(200);
      expect(response.body.document).toBe(validEnterpriseData.document); // still original
    });

    it("should allow partial updates (e.g. only phone)", async () => {
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ phone: "11977777777" });

      expect(response.status).toBe(200);
      expect(response.body.phone).toBe("11977777777");
      expect(response.body.name).toBe(validEnterpriseData.name); // unchanged
    });

    it("should update salesGroupLink correctly", async () => {
      // Create first
      await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ salesGroupLink: "https://group1.com" });

      // Update to new
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ salesGroupLink: "https://group2.com" });

      expect(response.status).toBe(200);
      expect(response.body.salesGroupLink).toBe("https://group2.com");

      // Verify DB has only 1 link
      const links = await prisma.enterpriseLinkGroup.findMany({ where: { enterpriseId } });
      expect(links).toHaveLength(1);
      expect(links[0].link).toBe("https://group2.com");
    });

    it("should remove salesGroupLink when null is passed", async () => {
      // Create first
      await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ salesGroupLink: "https://group1.com" });

      // Update to null
      const response = await request(app)
        .put("/enterprise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ salesGroupLink: null });

      expect(response.status).toBe(200);
      expect(response.body.salesGroupLink).toBe(null);

      const links = await prisma.enterpriseLinkGroup.findMany({ where: { enterpriseId } });
      expect(links).toHaveLength(0);
    });
  });
});
