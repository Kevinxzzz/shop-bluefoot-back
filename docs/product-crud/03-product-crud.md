# 03 - CRUD de Produtos (Leitura e Edição Simples)

## Estratégia

### Autorização e Recuperação (`getAuthorizedProduct`)
Assinatura:
```typescript
async function getAuthorizedProduct(productId: string, user: AuthenticatedUser, action: "read" | "update" | "delete")
```
Se a ação for `update`, Admin será rejeitado. Se for `read`, Admin é autorizado e Seller só acessa se for o dono.

### Listagem e Paginação
A busca via Prisma usará `orderBy: { createdAt: "desc" }` e as consultas de contagem (`count`) garantirão o retorno dos metadados matemáticos de paginação:
```json
{
  "products": [{ "id": "...", "user": { "id": "...", "name": "..." } }],
  "page": 1, "limit": 20, "totalItems": 15, "totalPages": 1
}
```

### Edição de Categorias Segura (`PUT /products/:id`)
Apenas o dono acessa. O vinculo das categorias no Prisma ocorrerá estritamente protegido por transação:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.product.update({ ... });
  await tx.productCategory.deleteMany({ where: { productId: id } });
  await tx.productCategory.createMany({ data: [...] });
});
```

## Riscos
- Sem o `$transaction`, uma rede lenta durante a atualização das categorias poderia deletar todas as antigas e falhar ao criar as novas, danificando o produto. O `$transaction` blinda este risco.
