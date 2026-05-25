import 'dotenv/config';

export const env = {
    PORT: Number(process.env.API_PORT) || 3333,
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET || 'default_secret',
};
