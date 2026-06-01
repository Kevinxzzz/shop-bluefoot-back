import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = process.env.NODE_ENV === "test" && fs.existsSync(path.resolve(process.cwd(), ".env.test"))
  ? path.resolve(process.cwd(), ".env.test")
  : path.resolve(process.cwd(), ".env");

dotenv.config({ path: envPath });
import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string(),
  JWT_SECRET: z
    .string()
    .min(10, "JWT_SECRET deve ter pelo menos 10 caracteres"),
  FRONTEND_URL: z.string().url(),
  TRUST_PROXY: z.enum(["true", "false"]).transform((val) => val === "true"),
  AWS_ACESS_KEY: z.string(),
  "AWS_SECRECT_ACESS-KEY": z.string(),
  AWS_REGION: z.string(),
  AWS_BUCKET_NAME: z.string(),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  PORT: parsedEnv.API_PORT,
  DATABASE_URL: parsedEnv.DATABASE_URL,
  JWT_SECRET: parsedEnv.JWT_SECRET,
  FRONTEND_URL: parsedEnv.FRONTEND_URL,
  TRUST_PROXY: parsedEnv.TRUST_PROXY,
  AWS_ACCESS_KEY: parsedEnv.AWS_ACESS_KEY,
  AWS_SECRET_ACCESS_KEY: parsedEnv["AWS_SECRECT_ACESS-KEY"],
  AWS_REGION: parsedEnv.AWS_REGION,
  AWS_BUCKET_NAME: parsedEnv.AWS_BUCKET_NAME,
};
