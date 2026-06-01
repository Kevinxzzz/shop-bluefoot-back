import { Router } from "express";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";
import { postProduct } from "./product.controller.js";

const productRoutes = Router();
productRoutes.use(authMiddleware);
productRoutes.post("/", postProduct);

export { productRoutes };
