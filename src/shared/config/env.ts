import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(10, "JWT_SECRET deve ter pelo menos 10 caracteres"),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
    PORT: parsedEnv.API_PORT,
    DATABASE_URL: parsedEnv.DATABASE_URL,
    JWT_SECRET: parsedEnv.JWT_SECRET,
};
