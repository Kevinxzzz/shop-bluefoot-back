import cors from "cors";
import { env } from "../config/env.js";

export const corsConfig = cors({
  origin: env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
});
