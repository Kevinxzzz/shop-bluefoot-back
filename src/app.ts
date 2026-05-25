import express from "express";
import { authRoutes } from "./modules/auth/auth.router.js";
import { enterpriseRoutes } from "./modules/enterprise/enterprise.router.js";
import { userRoutes } from "./modules/user/user.router.js";
import { errorHandler } from "./shared/middlewares/errorHandler.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/enterprise", enterpriseRoutes);
app.use("/users", userRoutes);

app.use(errorHandler);

export { app };
