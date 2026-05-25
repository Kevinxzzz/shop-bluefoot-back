import { Router } from "express";
import { create } from "./enterprise.controller.js";
import { registerLimiter } from "../../shared/security/rateLimit.js";

const enterpriseRoutes = Router();

enterpriseRoutes.post("/register", registerLimiter, create);

export { enterpriseRoutes };
