import { describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../shared/database/prisma.js";
import { env } from "../../shared/config/env.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

describe("Token Module", () => {
  let enterpriseId: string;
  let otherEnterpriseId: string;
  let adminId: string;
  let sellerId: string;
  let adminToken: string;
  let sellerToken: string;
  let adminRoleId: string;
  let sellerRoleId: string;

  beforeEach(async () => {
    // Clear tables
    await prisma.enterpriseInviteToken.deleteMany();
    await prisma.userToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();

    // Ensure Roles exist
    let adminRole = await prisma.userRole.findFirst({
      where: { role: "ADMIN" },
    });
    if (!adminRole) {
      adminRole = await prisma.userRole.create({
        data: { role: "ADMIN", description: "Admin" },
      });
    }
    adminRoleId = adminRole.id;

    let sellerRole = await prisma.userRole.findFirst({
      where: { role: "SELLER" },
    });
    if (!sellerRole) {
      sellerRole = await prisma.userRole.create({
        data: { role: "SELLER", description: "Seller" },
      });
    }
    sellerRoleId = sellerRole.id;

    // Create Main Enterprise
    const enterprise = await prisma.enterprise.create({
      data: { cnpj: "11111111111111", name: "Main Corp", phoneNumber: "111" },
    });
    enterpriseId = enterprise.id;

    // Create Other Enterprise
    const otherEnterprise = await prisma.enterprise.create({
      data: { cnpj: "22222222222222", name: "Other Corp", phoneNumber: "222" },
    });
    otherEnterpriseId = otherEnterprise.id;

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        name: "Admin",
        email: "admin@corp.com",
        password: "hash",
        roleId: adminRoleId,
        enterpriseId,
      },
    });
    adminId = adminUser.id;

    // Create Seller User
    const sellerUser = await prisma.user.create({
      data: {
        name: "Seller",
        email: "seller@corp.com",
        password: "hash",
        roleId: sellerRoleId,
        enterpriseId,
      },
    });
    sellerId = sellerUser.id;

    // Generate JWTs
    adminToken = jwt.sign(
      { userId: adminId, email: adminUser.email, role: "ADMIN", enterpriseId },
      env.JWT_SECRET,
      { expiresIn: "1h", algorithm: "HS256" },
    );

    sellerToken = jwt.sign(
      {
        userId: sellerId,
        email: sellerUser.email,
        role: "SELLER",
        enterpriseId,
      },
      env.JWT_SECRET,
      { expiresIn: "1h", algorithm: "HS256" },
    );
  });

  describe("POST /tokens", () => {
    it("should allow ADMIN to create an invite token", async () => {
      const expiredAt = new Date();
      expiredAt.setDate(expiredAt.getDate() + 7); // 7 days from now

      const response = await request(app)
        .post("/tokens")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          maxUses: 5,
          expiredAt: expiredAt.toISOString(),
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("rawToken");
      expect(typeof response.body.rawToken).toBe("string");

      const rawToken = response.body.rawToken;

      const dbToken = await prisma.enterpriseInviteToken.findFirst({
        where: { token: rawToken },
      });

      expect(dbToken).not.toBeNull();
      expect(dbToken?.enterpriseId).toBe(enterpriseId);
      expect(dbToken?.createdByAdminId).toBe(adminId);
      expect(dbToken?.maxUses).toBe(5);
      expect(dbToken?.token).toBe(rawToken); // Guarantee raw token is saved
    });

    it("should prevent SELLER from creating an invite token", async () => {
      const response = await request(app)
        .post("/tokens")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ maxUses: 5, expiredAt: new Date().toISOString() });

      expect(response.status).toBe(403);
    });

    it("should reject invalid maxUses (<= 0)", async () => {
      const response = await request(app)
        .post("/tokens")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          maxUses: 0,
          expiredAt: new Date(Date.now() + 10000).toISOString(),
        });

      expect(response.status).toBe(400);
    });

    it("should reject past expiredAt dates", async () => {
      const response = await request(app)
        .post("/tokens")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          maxUses: 5,
          expiredAt: new Date(Date.now() - 10000).toISOString(),
        });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /tokens/:id", () => {
    let tokenIdToRevoke: string;

    beforeEach(async () => {
      const dbToken = await prisma.enterpriseInviteToken.create({
        data: {
          token: "dummy_raw_token_for_test",
          maxUses: 10,
          expiredAt: new Date(Date.now() + 100000),
          enterpriseId,
          createdByAdminId: adminId,
        },
      });
      tokenIdToRevoke = dbToken.id;
    });

    it("should allow ADMIN to revoke a token from their enterprise", async () => {
      const response = await request(app)
        .delete(`/tokens/${tokenIdToRevoke}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(204);

      const dbToken = await prisma.enterpriseInviteToken.findUnique({
        where: { id: tokenIdToRevoke },
      });

      expect(dbToken?.canceledAt).not.toBeNull();
    });

    it("should prevent ADMIN from revoking a token from another enterprise (Tenant Isolation)", async () => {
      const otherToken = await prisma.enterpriseInviteToken.create({
        data: {
          token: "other_dummy_raw_token",
          maxUses: 10,
          expiredAt: new Date(Date.now() + 100000),
          enterpriseId: otherEnterpriseId, // Belongs to other enterprise
          createdByAdminId: adminId, // Reusing adminId just for relation, doesn't matter
        },
      });

      const response = await request(app)
        .delete(`/tokens/${otherToken.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404); // Should not find it due to tenant filter

      const dbToken = await prisma.enterpriseInviteToken.findUnique({
        where: { id: otherToken.id },
      });

      expect(dbToken?.canceledAt).toBeNull(); // Must remain unrevoked
    });

    it("should prevent SELLER from revoking a token", async () => {
      const response = await request(app)
        .delete(`/tokens/${tokenIdToRevoke}`)
        .set("Authorization", `Bearer ${sellerToken}`);

      expect(response.status).toBe(403);
    });

    it("should return 404 if token is already canceled", async () => {
      await prisma.enterpriseInviteToken.update({
        where: { id: tokenIdToRevoke },
        data: { canceledAt: new Date() },
      });

      const response = await request(app)
        .delete(`/tokens/${tokenIdToRevoke}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe("GET /tokens/validate/:rawToken", () => {
    let validRawToken: string;

    beforeEach(async () => {
      validRawToken = "valid_token_for_validation_test";
      await prisma.enterpriseInviteToken.create({
        data: {
          token: validRawToken,
          maxUses: 10,
          expiredAt: new Date(Date.now() + 100000), // future
          enterpriseId,
          createdByAdminId: adminId,
        },
      });
    });

    it("should return token data if valid", async () => {
      const response = await request(app).get(`/tokens/validate/${validRawToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: true,
        enterpriseName: "Main Corp",
        maxUses: 10,
        currentUses: 0,
      });
    });

    it("should return 400 if token is invalid/not found", async () => {
      const response = await request(app).get(`/tokens/validate/invalid_token_123`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Convite inválido ou não encontrado");
    });

    it("should return 400 if token is revoked", async () => {
      await prisma.enterpriseInviteToken.updateMany({
        where: { token: validRawToken },
        data: { canceledAt: new Date() },
      });

      const response = await request(app).get(`/tokens/validate/${validRawToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Convite revogado");
    });

    it("should return 400 if token is expired", async () => {
      await prisma.enterpriseInviteToken.updateMany({
        where: { token: validRawToken },
        data: { expiredAt: new Date(Date.now() - 10000) }, // past
      });

      const response = await request(app).get(`/tokens/validate/${validRawToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Convite expirado");
    });

    it("should return 400 if token max uses are reached", async () => {
      // Simulate max uses reached by updating maxUses to 0
      await prisma.enterpriseInviteToken.updateMany({
        where: { token: validRawToken },
        data: { maxUses: 0 },
      });

      const response = await request(app).get(`/tokens/validate/${validRawToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Limite de usos do convite atingido");
    });
  });
});
