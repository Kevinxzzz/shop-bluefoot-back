import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";
import multer from "multer";

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

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return response.status(400).json({
        error: "A imagem deve possuir no máximo 5MB.",
      });
    }
    return response.status(400).json({
      error: `Erro no upload: ${err.message}`,
    });
  }

  console.error(err);

  return response.status(500).json({
    error: "Erro interno no servidor",
  });
}
