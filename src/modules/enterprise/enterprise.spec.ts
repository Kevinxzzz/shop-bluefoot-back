import { describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../shared/database/prisma.js";

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
      include: { role: true },
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
});
