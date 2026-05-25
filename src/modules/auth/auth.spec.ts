import { describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { app } from "../../app.js";
import { prisma } from "../../shared/database/prisma.js";
import { env } from "../../shared/config/env.js";

describe("Auth Module", () => {
  let enterpriseId: string;
  let adminRoleId: string;

  beforeEach(async () => {
    // Limpar tabelas mantendo as roles do setup
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();

    // Obter ou criar role ADMIN
    let adminRole = await prisma.userRole.findFirst({
      where: { role: "ADMIN" },
    });
    if (!adminRole) {
      adminRole = await prisma.userRole.create({
        data: { role: "ADMIN", description: "Admin" },
      });
    }
    adminRoleId = adminRole.id;

    // Criar empresa de teste
    const enterprise = await prisma.enterprise.create({
      data: {
        cnpj: "12345678901234",
        name: "Empresa de Teste",
        phoneNumber: "999999999",
      },
    });
    enterpriseId = enterprise.id;
  });

  it("should successfully log in an existing user and return a JWT token", async () => {
    const password = "password123";
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: "Admin User",
        email: "admin@test.com",
        password: hashedPassword,
        roleId: adminRoleId,
        enterpriseId,
      },
    });

    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "admin@test.com",
        password,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(response.body.user).toHaveProperty("id");
    expect(response.body.user.email).toBe("admin@test.com");
    expect(response.body.user.role).toBe("ADMIN");

    // Verificar token decodificado
    const decoded = jwt.verify(response.body.token, env.JWT_SECRET) as any;
    expect(decoded.userId).toBe(user.id);
    expect(decoded.email).toBe(user.email);
    expect(decoded.role).toBe("ADMIN");
    expect(decoded.enterpriseId).toBe(enterpriseId);
  });

  it("should fail login if password does not match", async () => {
    const hashedPassword = await bcrypt.hash("password123", 10);

    await prisma.user.create({
      data: {
        name: "Admin User",
        email: "admin@test.com",
        password: hashedPassword,
        roleId: adminRoleId,
        enterpriseId,
      },
    });

    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "admin@test.com",
        password: "wrongpassword",
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Credenciais inválidas");
  });

  it("should fail login if email does not exist", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "nonexistent@test.com",
        password: "password123",
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Credenciais inválidas");
  });

  it("should fail login if the user has been soft-deleted", async () => {
    const hashedPassword = await bcrypt.hash("password123", 10);

    await prisma.user.create({
      data: {
        name: "Admin User",
        email: "admin@test.com",
        password: hashedPassword,
        roleId: adminRoleId,
        enterpriseId,
        deletedAt: new Date(),
      },
    });

    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "admin@test.com",
        password: "password123",
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Credenciais inválidas");
  });
});
