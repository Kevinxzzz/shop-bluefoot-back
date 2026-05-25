import type { NextFunction, Request, Response } from "express";
import { createEnterpriseSchema } from "./enterprise.schema.js";
import { createEnterprise } from "./enterprise.service.js";

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = createEnterpriseSchema.parse(req.body);
    
    const result = await createEnterprise(parsedData);
    
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
