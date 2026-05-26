import { Router } from "express";
import { login, me } from "./auth.controller.js";
import { authLimiter } from "../../shared/security/rateLimit.js";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";

const authRoutes = Router();

authRoutes.post("/login", authLimiter, login);
authRoutes.get("/me", authMiddleware, me);

export { authRoutes };