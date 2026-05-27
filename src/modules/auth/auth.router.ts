import { Router } from "express";
import { login, me, registerSellerHandler } from "./auth.controller.js";
import { authLimiter, registerLimiter } from "../../shared/security/rateLimit.js";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";

const authRoutes = Router();

authRoutes.post("/login", authLimiter, login);
authRoutes.post("/register-seller", registerLimiter, registerSellerHandler);
authRoutes.get("/me", authMiddleware, me);

export { authRoutes };
