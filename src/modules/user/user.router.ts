import { Router } from "express";
import { getUsers, updateUserRole, updateProfile, getProfile } from "./user.controller.js";
import { authMiddleware, authorizeRole } from "../../shared/middlewares/authMiddleware.js";

const userRoutes = Router();

userRoutes.get("/profile", authMiddleware, getProfile);
userRoutes.patch("/profile", authMiddleware, updateProfile);

userRoutes.use(authMiddleware, authorizeRole(["ADMIN"]));
userRoutes.get("/", getUsers);
userRoutes.patch("/:id/role", updateUserRole);

export { userRoutes };

