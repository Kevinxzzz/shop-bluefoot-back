import { Router } from "express";
import { getUsers, updateUserRole, updateProfile, getProfile, getPublicUsersHandler, getPublicUserByIdHandler, deleteUser } from "./user.controller.js";
import { authMiddleware, authorizeRole } from "../../shared/middlewares/authMiddleware.js";

const userRoutes = Router();

// Public routes
userRoutes.get("/enterprise-martins", getPublicUsersHandler);
userRoutes.get("/enterprise-martins/:id", getPublicUserByIdHandler);

// Protected routes
userRoutes.get("/profile", authMiddleware, getProfile);
userRoutes.patch("/profile", authMiddleware, updateProfile);

userRoutes.use(authMiddleware, authorizeRole(["ADMIN"]));
userRoutes.get("/", getUsers);
userRoutes.patch("/:id/role", updateUserRole);
userRoutes.delete("/:id", deleteUser);
export { userRoutes };

