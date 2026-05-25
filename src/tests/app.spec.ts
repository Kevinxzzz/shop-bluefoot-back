import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import { app } from "../app.js";

describe("Global Integration Health Check", () => {
  it("should return status ok for health check endpoint", async () => {
    const response = await request(app).get("/health");
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
