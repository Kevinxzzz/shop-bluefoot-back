import express from "express";
import helmet from "helmet";
import { env } from "./shared/config/env.js";
import { corsConfig } from "./shared/security/cors.js";
import { authRoutes } from "./modules/auth/auth.router.js";
import { tokenRoutes } from "./modules/token/token.router.js";
import { enterpriseRoutes } from "./modules/enterprise/enterprise.router.js";
import { userRoutes } from "./modules/user/user.router.js";
import { errorHandler } from "./shared/middlewares/errorHandler.js";

const app = express();

if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(corsConfig);

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/tokens", tokenRoutes);
app.use("/enterprise", enterpriseRoutes);
app.use("/users", userRoutes);

app.use(errorHandler);

export { app };
