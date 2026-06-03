# 01 - Análise do Módulo de Produtos

## Objetivo
Estabelecer uma implementação segura e escalável para o CRUD de produtos no sistema SaaS Multi-tenant. 

## Arquivos Impactados
- `src/modules/product/product.router.ts`: Mapeamento das rotas.
- `src/modules/product/product.schema.ts`: Validações de entrada.
- `src/modules/product/product.controller.ts`: Orquestração.
- `src/modules/product/product.service.ts`: Lógica, auth, S3.
- `src/modules/product/product.spec.ts`: Testes unitários/integração.

## Estratégia Principal
- **Autorização Baseada em Ação**: Uso do `getAuthorizedProduct(productId, user, action)` (`"read"`, `"update"`, `"delete"`) para separar permissões granulares sem encher o código de condicionais mistos.
- **Paginação Completa**: Listagens retornarão envelopadas em `products`, `page`, `limit`, `totalItems` e `totalPages`.
- **Hard Delete**: Remoção física e permanente (`deletedAt` não utilizado).
- **Mídias via Delta**: Remoção do S3 prioriza falha tolerante (mantém a transação do DB).
- **Consistência de Categorias**: Atualizações feitas com `deleteMany` seguido de `createMany` no banco.

## Riscos
- **Lixo Digital na AWS**: Tolerar erros no comando de exclusão do S3 evitará quebras no banco (Prioridade 1), mas pode resultar em arquivos órfãos se a rede flutuar.

## Validações Gerais
- Garantir que um usuário nunca veja/toque em Produtos de outra empresa.
- Assegurar a existência constante de uma Foto Principal (`isMain = true`).
