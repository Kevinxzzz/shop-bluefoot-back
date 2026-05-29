import multer from "multer";
import multerS3 from "multer-s3";
import { s3 } from "./s3.js";
import { env } from "./env.js";

export const upload = multer({
  storage: multerS3({
    s3,
    bucket: env.AWS_BUCKET_NAME!,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (_, file, cb) => {
      const fileName = `${Date.now()}-${file.originalname}`;

      cb(null, fileName);
    },
  }),
});
