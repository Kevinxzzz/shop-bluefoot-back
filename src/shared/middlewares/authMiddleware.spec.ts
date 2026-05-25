import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import express from "express";
import { authMiddleware, authorizeRole } from "./authMiddleware.js";
import { prisma } from "../database/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

const app = express();
app.use(express.json());

app.get("/test", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get("/admin", authMiddleware, authorizeRole(["ADMIN"]), (req, res) => {
  res.json({ ok: true });
});

// Simple error handler for AppError
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Internal Error" });
  }
});

describe("authMiddleware", () => {
  let enterpriseId: string;
  let adminRoleId: string;
  let sellerRoleId: string;

  beforeEach(async () => {
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();
    // we don't delete roles, just find or create them
    
    let adminRole = await prisma.userRole.findFirst({ where: { role: "ADMIN" } });
    if (!adminRole) {
      adminRole = await prisma.userRole.create({ data: { role: "ADMIN", description: "Admin" } });
    }
    adminRoleId = adminRole.id;

    let sellerRole = await prisma.userRole.findFirst({ where: { role: "SELLER" } });
    if (!sellerRole) {
      sellerRole = await prisma.userRole.create({ data: { role: "SELLER", description: "Seller" } });
    }
    sellerRoleId = sellerRole.id;

    const enterprise = await prisma.enterprise.create({
      data: {
        cnpj: "99999999999999",
        name: "Test Auth Enterprise",
        phoneNumber: "888888888",
      },
    });
    enterpriseId = enterprise.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should allow access with a valid token and active user", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Active User",
        email: "active@test.com",
        password: "hashed",
        roleId: adminRoleId,
        enterpriseId,
      },
    });

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET);

    const response = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toHaveProperty("userId", user.id);
    expect(response.body.user).toHaveProperty("role", "ADMIN");
  });

  it("should deny access if user is soft-deleted", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Deleted User",
        email: "deleted@test.com",
        password: "hashed",
        roleId: adminRoleId,
        enterpriseId,
        deletedAt: new Date(),
      },
    });

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET);

    const response = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Usuário não encontrado ou inativo");
  });

  it("should deny access if user does not exist in the database", async () => {
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    const token = jwt.sign({ userId: fakeUserId }, env.JWT_SECRET);

    const response = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Usuário não encontrado ou inativo");
  });

  it("should deny access if token is invalid or missing Bearer", async () => {
    // Missing Bearer
    const response1 = await request(app)
      .get("/test")
      .set("Authorization", `InvalidScheme token123`);
    expect(response1.status).toBe(401);

    // Completely invalid token
    const response2 = await request(app)
      .get("/test")
      .set("Authorization", `Bearer invalid.token.here`);
    expect(response2.status).toBe(401);

    // No header
    const response3 = await request(app).get("/test");
    expect(response3.status).toBe(401);
  });

  it("should update role in req.user if user role changes in DB after token was issued", async () => {
    // 1. Create a user as ADMIN
    const user = await prisma.user.create({
      data: {
        name: "Role Change User",
        email: "role@test.com",
        password: "hashed",
        roleId: adminRoleId,
        enterpriseId,
      },
    });

    // 2. Issue a token (the payload shouldn't really matter now, but we'll include role like old tokens might have)
    const token = jwt.sign({ userId: user.id, role: "ADMIN" }, env.JWT_SECRET);

    // 3. Admin user changes their role to SELLER in the DB
    await prisma.user.update({
      where: { id: user.id },
      data: { roleId: sellerRoleId },
    });

    // 4. Try to access a route that requires ADMIN
    const response = await request(app)
      .get("/admin")
      .set("Authorization", `Bearer ${token}`);

    // Since the middleware fetches the fresh role from DB, req.user.role will be SELLER.
    // The authorizeRole middleware should then block access (403).
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Acesso negado");
  });

});
