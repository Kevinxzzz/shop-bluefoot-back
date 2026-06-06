import { Router } from "express";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";
import { optionalAuthMiddleware } from "../../shared/middlewares/optionalAuthMiddleware.js";
import { productMediaUpload } from "../../shared/config/multer/productMediaUpload.js";
import { 
  postProduct,
  getEnterpriseProductsHandler,
  getUserProductsHandler,
  getProductByIdHandler,
  updateProductHandler,
  updateProductMediaHandler,
  deleteProductHandler
} from "./product.controller.js";

const productRoutes = Router();

productRoutes.get("/:id", optionalAuthMiddleware, getProductByIdHandler);

productRoutes.use(authMiddleware);

productRoutes.post("/", postProduct);
productRoutes.get("/", getEnterpriseProductsHandler);
productRoutes.get("/user/:userId", getUserProductsHandler);
productRoutes.put("/:id", updateProductHandler);
productRoutes.put("/:id/media", productMediaUpload.array("files"), updateProductMediaHandler);
productRoutes.delete("/:id", deleteProductHandler);

export { productRoutes };
