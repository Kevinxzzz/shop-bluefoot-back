import type { Request, Response } from "express";

export const postUpload = (req: Request, res: Response) => {
   const file = req.file as Express.Multer.File & { location?: string };

   return res.json({
     url: file?.location,
   });
};