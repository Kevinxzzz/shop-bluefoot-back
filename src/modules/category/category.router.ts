import { Router } from "express";
import { authMiddleware, authorizeRole } from "../../shared/middlewares/authMiddleware.js";
import {
  createCategoryController,
  deleteCategoryPermanentlyController,
  getCategoriesController,
  archiveCategoryController,
  restoreCategoryController,
  updateCategoryController,
  getPublicCategoriesController,
} from "./category.controller.js";

const categoryRoutes = Router();

categoryRoutes.get("/public/enterprise-martins", getPublicCategoriesController);

categoryRoutes.use(authMiddleware, authorizeRole(["ADMIN"]));

categoryRoutes.post("/", createCategoryController);
categoryRoutes.get("/", getCategoriesController);
categoryRoutes.patch("/:id", updateCategoryController);
categoryRoutes.patch("/:id/archive", archiveCategoryController);
categoryRoutes.patch("/:id/restore", restoreCategoryController);
categoryRoutes.delete("/:id", deleteCategoryPermanentlyController);

export { categoryRoutes };
