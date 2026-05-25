import { Router } from "express";
import { login } from "./auth.controller.js";

const authRoutes = Router();

authRoutes.post("/login", login);

export { authRoutes };