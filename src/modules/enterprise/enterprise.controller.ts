import type { NextFunction, Request, Response } from "express";
import { createEnterpriseSchema, updateEnterpriseSchema } from "./enterprise.schema.js";
import { createEnterprise, getEnterprise, updateEnterprise, getEnterpriseFirstLink } from "./enterprise.service.js";
import { env } from "../../shared/config/env.js";
import { AppError } from "../../shared/errors/AppError.js";
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

export const getPublicEnterpriseLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enterpriseId = env.ID_ENTERPRISE_MARTINS;
    if (!enterpriseId) {
      throw new AppError(
        "A loja pública não está configurada corretamente (Falta ID_ENTERPRISE_MARTINS).",
        500
      );
    }
    
    const result = await getEnterpriseFirstLink(enterpriseId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
