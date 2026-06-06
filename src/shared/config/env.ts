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
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string(),
  JWT_SECRET: z
    .string()
    .min(10, "JWT_SECRET deve ter pelo menos 10 caracteres"),
  FRONTEND_URL: z.string().url(),
  TRUST_PROXY: z.enum(["true", "false"]).transform((val) => val === "true"),
  AWS_ACCESS_KEY: z.string(),
  AWS_SECRECT_ACCESS_KEY: z.string(),
  AWS_REGION: z.string(),
  AWS_BUCKET_NAME: z.string(),
  PUBLIC_ENTERPRISE_ID: z.string().optional(),
  ID_ENTERPRISE_MARTINS: z.string(),
});

const preprocessedEnv = {
  ...process.env,
  AWS_ACCESS_KEY:
    process.env.AWS_ACESS_KEY ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY,
  AWS_SECRECT_ACCESS_KEY:
    process.env.AWS_SECRECT_ACCESS_KEY ||
    process.env.AWS_SECRECT_ACESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env["AWS_SECRECT_ACESS-KEY"],
};

const parsedEnv = envSchema.parse(preprocessedEnv);

export const env = {
  NODE_ENV: parsedEnv.NODE_ENV,
  PORT: parsedEnv.API_PORT,
  DATABASE_URL: parsedEnv.DATABASE_URL,
  JWT_SECRET: parsedEnv.JWT_SECRET,
  FRONTEND_URL: parsedEnv.FRONTEND_URL,
  TRUST_PROXY: parsedEnv.TRUST_PROXY,
  AWS_ACCESS_KEY: parsedEnv.AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY: parsedEnv.AWS_SECRECT_ACCESS_KEY,
  AWS_REGION: parsedEnv.AWS_REGION,
  AWS_BUCKET_NAME: parsedEnv.AWS_BUCKET_NAME,
  PUBLIC_ENTERPRISE_ID: parsedEnv.PUBLIC_ENTERPRISE_ID,
  ID_ENTERPRISE_MARTINS: parsedEnv.ID_ENTERPRISE_MARTINS,
};
