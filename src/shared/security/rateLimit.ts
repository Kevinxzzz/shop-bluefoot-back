import rateLimit from "express-rate-limit";
import { AppError } from "../errors/AppError.js";

// [Nota Arquitetural]
// A implementação atual do rate-limit utilizará memória local do processo Node.js.
// Em ambientes distribuídos ou com múltiplas instâncias, futuramente deve-se migrar
// para um store compartilhado (ex: Redis) para evitar fragmentação dos limites.

const handler = () => {
  throw new AppError(
    "Limite de requisições excedido. Tente novamente mais tarde.",
    429,
  );
};

export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // Limite de 5 tentativas por IP
  handler,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20, // Limite de 20 tentativas por IP
  handler,
});
