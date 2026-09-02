import { describe, it, expect, beforeEach, jest } from "@jest/globals";
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

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Internal Error" });
  }
});

describe("authMiddleware", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const validPayload = {
    userId: "user-1",
    email: "user@test.com",
    role: "SELLER",
    enterpriseId: "ent-1",
  };

  const validToken = jwt.sign(validPayload, env.JWT_SECRET, {
    algorithm: "HS256",
  });

  it("1. deve permitir acesso com token válido e usuário ativo", async () => {
    jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
      id: "user-1",
      name: "Usuário Teste",
      email: "user@test.com",
      enterpriseId: "ent-1",
      role: { role: "SELLER" },
    } as any);

    const response = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "user-1",
      userId: "user-1",
      name: "Usuário Teste",
      email: "user@test.com",
      role: "SELLER",
      enterpriseId: "ent-1",
    });
  });

  it("2. deve negar acesso se usuário não for encontrado no banco ou estiver inativo", async () => {
    jest.spyOn(prisma.user, "findFirst").mockResolvedValue(null as any);

    const response = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Usuário não encontrado ou inativo");
  });

  it("3. deve negar acesso se o header Authorization não for fornecido", async () => {
    const response = await request(app).get("/test");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Token JWT não informado");
  });

  it("4. deve negar acesso se o esquema não for Bearer", async () => {
    const response = await request(app)
      .get("/test")
      .set("Authorization", `Basic ${validToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Token JWT mal formatado");
  });

  it("5. deve negar acesso se o token JWT for inválido ou tiver assinatura errada", async () => {
    const invalidToken = jwt.sign(validPayload, "wrong-secret", {
      algorithm: "HS256",
    });

    const response = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${invalidToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Token JWT inválido");
  });

  it("6. deve atualizar a role no req.user baseado no banco, não no token", async () => {
    // Token dizia SELLER, mas banco agora diz ADMIN
    jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
      id: "user-1",
      name: "Usuário Promovido",
      email: "user@test.com",
      enterpriseId: "ent-1",
      role: { role: "ADMIN" },
    } as any);

    const response = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("ADMIN");
  });

  describe("authorizeRole", () => {
    it("7. deve permitir acesso se o usuário tiver a role permitida", async () => {
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "user-1",
        name: "Admin",
        email: "admin@test.com",
        enterpriseId: "ent-1",
        role: { role: "ADMIN" },
      } as any);

      const response = await request(app)
        .get("/admin")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    it("8. deve negar acesso (403) se o usuário não tiver a role permitida", async () => {
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
        id: "user-1",
        name: "Seller",
        email: "seller@test.com",
        enterpriseId: "ent-1",
        role: { role: "SELLER" },
      } as any);

      const response = await request(app)
        .get("/admin")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Acesso negado");
    });
  });
});
