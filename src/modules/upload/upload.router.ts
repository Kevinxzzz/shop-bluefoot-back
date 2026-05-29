import { Router } from "express";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";
import { imageUpload } from "../../shared/config/multer/imageUpload.js";
import { postUpload } from "./upload.controller.js";

const uploadRoutes = Router();
uploadRoutes.use(authMiddleware);
uploadRoutes.post("/image-profile", imageUpload.single("file"), postUpload);

export { uploadRoutes };
