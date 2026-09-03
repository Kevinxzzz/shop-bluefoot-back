import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath =
  process.env.NODE_ENV === "test" &&
    fs.existsSync(path.resolve(process.cwd(), ".env.test"))
    ? path.resolve(process.cwd(), ".env.test")
    : path.resolve(process.cwd(), ".env");

dotenv.config({ path: envPath, quiet: process.env.NODE_ENV === "test" });
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  JWT_SECRET: z
    .string()
    .min(10, "JWT_SECRET deve ter pelo menos 10 caracteres"),
  FRONTEND_URL: z.string().url(),
  TRUST_PROXY: z.enum(["true", "false"]).transform((val) => val === "true"),
  R2_BUCKET_NAME: z.string(),
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  MEDIA_CDN_URL: z.string().url(),
  PUBLIC_ENTERPRISE_ID: z.string().optional(),
  ID_ENTERPRISE_MARTINS: z.string(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Variáveis de ambiente inválidas:", _env.error.format());
  throw new Error("Falha na inicialização: variáveis de ambiente inválidas ou ausentes.");
}

export const env = _env.data;