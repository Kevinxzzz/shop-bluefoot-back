import { Router } from "express";
import { createInvite, registerUser } from "./user.controller.js";
import { authMiddleware, authorizeRole } from "../../shared/middlewares/authMiddleware.js";

const userRoutes = Router();

userRoutes.post("/register/invite", registerUser);
userRoutes.use(authMiddleware, authorizeRole(["ADMIN"]));
userRoutes.post("/invite", createInvite);

export { userRoutes };
