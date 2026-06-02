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
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (req, file, cb) => {
      const userId = req.user?.userId;
      const enterpriseId = req.user?.enterpriseId;
      const sanitizedName = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^\w.-]/g, "");
      const fileName = `enterprise/${enterpriseId}/users/${userId}/avatar/${Date.now()}-${sanitizedName}`;
      cb(null, fileName);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          "Invalid file type. Only JPEG, PNG and WEBP are allowed.",
        ) as any,
      );
    }
  },
});
