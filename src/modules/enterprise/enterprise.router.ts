import { Router } from "express";
import { create } from "./enterprise.controller.js";

const enterpriseRoutes = Router();

enterpriseRoutes.post("/register", create);

export { enterpriseRoutes };
