import { Router } from "express";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";
import { optionalAuthMiddleware } from "../../shared/middlewares/optionalAuthMiddleware.js";
import { productMediaUpload } from "../../shared/config/multer/productMediaUpload.js";
import { 
  postProduct,
  getEnterpriseProductsHandler,
  getPublicProductsHandler,
  getUserProductsHandler,
  getProductByIdHandler,
  updateProductHandler,
  updateProductMediaHandler,
  deleteProductHandler
} from "./product.controller.js";

const productRoutes = Router();

// Public routes
productRoutes.get("/enterprise-martins", getPublicProductsHandler);

// Protected routes (must be defined BEFORE /:id to prevent interception)
productRoutes.get("/enterprise", authMiddleware, getEnterpriseProductsHandler);
productRoutes.get("/user/:userId", authMiddleware, getUserProductsHandler);
productRoutes.post("/", authMiddleware, postProduct);
productRoutes.put("/:id", authMiddleware, updateProductHandler);
productRoutes.put("/:id/media", authMiddleware, productMediaUpload.array("files"), updateProductMediaHandler);
productRoutes.delete("/:id", authMiddleware, deleteProductHandler);

// Public dynamic route (must be at the bottom)
productRoutes.get("/:id", optionalAuthMiddleware, getProductByIdHandler);

export { productRoutes };
