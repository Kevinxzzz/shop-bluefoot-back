import type { Request, Response, NextFunction } from "express";
import { createInviteToken, revokeInviteToken, listTokens, validateInviteToken } from "./token.service.js";
import { createTokenSchema, revokeTokenSchema, validateTokenSchema } from "./token.schema.js";

export async function createToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = createTokenSchema.parse(req.body);

    const user = req.user!; // Checked by authMiddleware

    const result = await createInviteToken({
      maxUses: data.maxUses,
      expiredAt: data.expiredAt,
      enterpriseId: user.enterpriseId,
      adminId: user.id, // Or userId, since we enriched it
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function revokeToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = revokeTokenSchema.parse(req.params);

    const user = req.user!;

    await revokeInviteToken(id, user.enterpriseId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function listTokensHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = req.user!;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    
    const result = await listTokens(user.enterpriseId, page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function validateTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { rawToken } = validateTokenSchema.parse(req.params);
    const result = await validateInviteToken(rawToken);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
