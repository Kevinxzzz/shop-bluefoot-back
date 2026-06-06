import { Router } from "express";
import { create, getEnterpriseController, updateEnterpriseController, getPublicEnterpriseLink } from "./enterprise.controller.js";
import { registerLimiter } from "../../shared/security/rateLimit.js";
import { authMiddleware, authorizeRole } from "../../shared/middlewares/authMiddleware.js";

const enterpriseRoutes = Router();

enterpriseRoutes.post("/register", registerLimiter, create);
enterpriseRoutes.get("/enterprise-martins/link", getPublicEnterpriseLink);

enterpriseRoutes.get("/", authMiddleware, getEnterpriseController);
enterpriseRoutes.put("/", authMiddleware, authorizeRole(["ADMIN"]), updateEnterpriseController);

export { enterpriseRoutes };
