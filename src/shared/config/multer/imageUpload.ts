import multer from "multer";
import multerS3 from "multer-s3";
import { s3 } from "../s3.js";
import { env } from "../env.js";
import { AppError } from "../../errors/AppError.js";

const allowedMimes = ["image/jpeg", "image/png", "image/webp"];

export const imageUpload = multer({
  storage: multerS3({
    s3,
    bucket: env.AWS_BUCKET_NAME!,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (_, file, cb) => {
      const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`;
      cb(null, fileName);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError("Invalid file type. Only JPEG, PNG and WEBP are allowed.") as any);
    }
  },
});
