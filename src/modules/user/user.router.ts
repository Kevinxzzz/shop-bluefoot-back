import { Router } from "express";
import { createInvite, registerUser, getUsers, updateUserRole } from "./user.controller.js";
import { authMiddleware, authorizeRole } from "../../shared/middlewares/authMiddleware.js";
import { registerLimiter } from "../../shared/security/rateLimit.js";

const userRoutes = Router();

userRoutes.post("/register/invite", registerLimiter, registerUser);
userRoutes.use(authMiddleware, authorizeRole(["ADMIN"]));
userRoutes.get("/", getUsers);
userRoutes.post("/invite", createInvite);
userRoutes.patch("/:id/role", updateUserRole);

export { userRoutes };
