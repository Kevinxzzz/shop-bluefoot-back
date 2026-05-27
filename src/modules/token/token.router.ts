import { Router } from "express";
import { createToken, revokeToken, listTokensHandler, validateTokenHandler } from "./token.controller.js";
import {
  authMiddleware,
  authorizeRole,
} from "../../shared/middlewares/authMiddleware.js";

const tokenRoutes = Router();

// Rota pública para validação de convites
tokenRoutes.get("/validate/:rawToken", validateTokenHandler);

// Todas as rotas abaixo exigem autenticação e privilégios de ADMIN
tokenRoutes.use(authMiddleware, authorizeRole(["ADMIN"]));

tokenRoutes.get("/", listTokensHandler);
tokenRoutes.post("/", createToken);
tokenRoutes.delete("/:id", revokeToken);

export { tokenRoutes };
