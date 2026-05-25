import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";

export function errorHandler(
  err: Error,
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (err instanceof AppError) {
    return response.status(err.statusCode).json({
      error: err.message,
    });
  }

  if (err instanceof ZodError) {
    return response.status(400).json({
      error: "Erro de validação",
      details: err.issues,
    });
  }

  console.error(err);

  return response.status(500).json({
    error: "Erro interno no servidor",
  });
}
