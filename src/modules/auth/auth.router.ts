import { Router } from "express";
import { login } from "./auth.controller.js";
import { authLimiter } from "../../shared/security/rateLimit.js";

const authRoutes = Router();

authRoutes.post("/login", authLimiter, login);

export { authRoutes };