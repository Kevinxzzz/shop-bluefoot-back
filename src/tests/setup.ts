import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env.test"))
  ? path.resolve(process.cwd(), ".env.test")
  : path.resolve(process.cwd(), ".env");

dotenv.config({ path: envPath, quiet: true });
