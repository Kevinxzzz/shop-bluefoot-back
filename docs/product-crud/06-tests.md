# 06 - Estruturação dos Testes (TDD)

## Estratégia
Utilização do `vitest` ou `jest` com Mock na AWS S3. Testes cobrirão em detalhes a matriz de permissões gerada pelo helper `getAuthorizedProduct(id, user, action)`.

## Cenários de Sucesso Esperados
- `[GET]` Paginação devolve `products`, `page`, `limit`, `totalItems` e `totalPages`.
- `[GET]` Admin acessando e `user: {id, name}` listados.
- `[PUT]` Alteração de dados isolada num `$transaction` validando o replace de categorias via `deleteMany`/`createMany`.
- `[PUT]` Update de Mídia que exclui a principal força a primeira foto sobrevivente (ou primeira nova) a ser a `isMain`.
- `[DELETE]` AWS S3 mock rejeita limpeza mas API devolve status code 200 sem reverter exclusão do DB.

## Cenários de Falha e Bloqueio
- **Autorização**: Admin tentando realizar o `update` no produto do Seller falha (403).
- **Mídia Delta**: Deixar a soma de `FOTO = 0` dispara 400 antes de acessar o S3.
- **S3 Fallback Update**: O Update sofre MockError no Prisma, forçando o script a varrer o array `uploadedKeys[]` para limpar o que subiu pro S3 temporariamente.
