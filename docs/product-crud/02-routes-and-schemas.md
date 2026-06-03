# 02 - Rotas e Schemas (Zod)

## Objetivo
Garantir a integridade dos dados de entrada (Fail-fast).

## Estratégia (Rotas)
- `GET /products` (ADMIN)
- `GET /products/user/:userId` (ADMIN/SELLER)
- `GET /products/:id` (ADMIN/SELLER)
- `PUT /products/:id` (Apenas dono)
- `PUT /products/:id/media` (Apenas dono)
- `DELETE /products/:id` (ADMIN/SELLER)

## Estratégia (Schemas Zod)

**Paginação Restrita (Max 20)**:
```typescript
export const getProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
```

**Edição de Mídias (Sem Duplicidades)**:
```typescript
export const updateProductMediaSchema = z.object({
  keepMediaIds: z.array(z.string().uuid())
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "keepMediaIds não pode conter IDs duplicados.",
    })
    .optional()
    .default([]),
});
```

## Resposta Envelopada de Listagem
O frontend demanda dados da paginação. Os endpoints GET de listagem devolverão:
```typescript
{
  products: [...],
  page: 1,
  limit: 20,
  totalItems: 135,
  totalPages: 7
}
```
