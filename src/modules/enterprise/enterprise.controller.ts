import type { NextFunction, Request, Response } from "express";
import { createEnterpriseSchema, updateEnterpriseSchema } from "./enterprise.schema.js";
import { createEnterprise, getEnterprise, updateEnterprise } from "./enterprise.service.js";
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedData = createEnterpriseSchema.parse(req.body);
    
    const result = await createEnterprise(parsedData);
    
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const getEnterpriseController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enterpriseId = req.user!.enterpriseId;
    const result = await getEnterprise(enterpriseId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const updateEnterpriseController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enterpriseId = req.user!.enterpriseId;
    const parsedData = updateEnterpriseSchema.parse(req.body);
    
    const result = await updateEnterprise({ enterpriseId, data: parsedData });
    
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
