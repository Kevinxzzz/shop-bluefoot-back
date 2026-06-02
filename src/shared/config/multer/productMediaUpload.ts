import multer from "multer";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { AppError } from "../../errors/AppError.js";

const tmpDir = path.join(os.tmpdir(), "shop-martins");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export const productMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tmpDir);
    },
    filename: (req, file, cb) => {
      cb(null, randomUUID());
    },
  }),
  limits: {
    files: 4,
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new AppError("Tipo de arquivo inválido. Apenas imagens e vídeos são permitidos.") as any);
    }
  },
});
