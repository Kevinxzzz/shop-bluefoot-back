import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import express from "express";
import { app } from "../../app.js";
import { env } from "../config/env.js";
import { authLimiter } from "./rateLimit.js";
import rateLimit from "express-rate-limit";

describe("Security Measures (Helmet, CORS & Rate Limiting)", () => {
  describe("Helmet & General Headers", () => {
    it("should have helmet security headers present", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(response.headers["x-powered-by"]).toBeUndefined(); // Express powered by header is disabled
    });
  });

  describe("CORS Configuration", () => {
    it("should allow requests from valid FRONTEND_URL", async () => {
      const response = await request(app)
        .options("/health")
        .set("Origin", env.FRONTEND_URL);
      
      expect(response.headers["access-control-allow-origin"]).toBe(env.FRONTEND_URL);
    });

    it("should omit Access-Control-Allow-Origin header for invalid origin", async () => {
      const response = await request(app)
        .options("/health")
        .set("Origin", "http://malicious-site.com");
      
      // The browser is responsible for blocking if the header is missing
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Rate Limiting & Trust Proxy", () => {
    it("should isolate rate limits per IP when trust proxy is enabled", async () => {
      const testApp = express();
      testApp.set("trust proxy", 1);
      
      // Create a fresh limiter to avoid state sharing across tests
      const limiter = rateLimit({ windowMs: 60 * 1000, max: 2 });
      testApp.post("/login", limiter, (req, res) => { res.send("ok"); });

      // IP 1 uses 2 hits
      await request(testApp).post("/login").set("X-Forwarded-For", "192.168.0.1");
      await request(testApp).post("/login").set("X-Forwarded-For", "192.168.0.1");
      
      // IP 1 should be blocked
      const res1 = await request(testApp).post("/login").set("X-Forwarded-For", "192.168.0.1");
      expect(res1.status).toBe(429);

      // IP 2 should NOT be blocked
      const res2 = await request(testApp).post("/login").set("X-Forwarded-For", "192.168.0.2");
      expect(res2.status).toBe(200);
    });

    it("should share rate limit across all X-Forwarded-For IPs when trust proxy is disabled (demonstrating the vulnerability)", async () => {
      const testApp = express();
      testApp.set("trust proxy", false);
      
      // Create a fresh limiter
      const limiter = rateLimit({ windowMs: 60 * 1000, max: 2 });
      testApp.post("/login", limiter, (req, res) => { res.send("ok"); });

      // Simulate requests from different forwarded IPs
      await request(testApp).post("/login").set("X-Forwarded-For", "10.0.0.1");
      await request(testApp).post("/login").set("X-Forwarded-For", "10.0.0.2");
      
      // The next request with yet another IP will be blocked because 
      // the local Supertest IP is the one being rate-limited!
      const res = await request(testApp).post("/login").set("X-Forwarded-For", "10.0.0.3");
      expect(res.status).toBe(429);
    });

    it("should block requests when rate limit is exceeded on /auth/login within main app", async () => {
      const loginPayload = {
        email: "test@rate.limit",
        password: "password123",
      };

      // Limiter configurado no authLimiter é de 5 requisições
      for (let i = 0; i < 5; i++) {
        await request(app).post("/auth/login").send(loginPayload);
      }

      const response = await request(app).post("/auth/login").send(loginPayload);
      expect(response.status).toBe(429);
      expect(response.body.error).toBe("Limite de requisições excedido. Tente novamente mais tarde.");
    });
  });
});
