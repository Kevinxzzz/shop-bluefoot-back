import { Router } from "express";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";
import { imageUpload } from "../../shared/config/multer/imageUpload.js";
import { productMediaUpload } from "../../shared/config/multer/productMediaUpload.js";
import { postUpload, postProductMediaUpload } from "./upload.controller.js";

const uploadRoutes = Router();
uploadRoutes.use(authMiddleware);
uploadRoutes.post("/image-profile", imageUpload.single("file"), postUpload);
uploadRoutes.post("/product-media", productMediaUpload.array("files"), postProductMediaUpload);

export { uploadRoutes };
