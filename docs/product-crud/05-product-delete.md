# 05 - Exclusão de Produto (Delete)

## Objetivo
Implementar `Hard Delete` físico no banco de dados, utilizando o S3 de maneira tolerante a falhas.

## Estratégia (DB First)

1. **Autorização**: Chamar `getAuthorizedProduct(productId, user, "delete")`.
2. **Backup das Keys**: Resgatar em memória o endereço AWS de todos os vídeos e fotos acoplados.
3. **Deleção Física (Prisma)**: O método `.delete()` extirpará o Produto, as Categorias associadas e os `ProductMedia` por relacionamento Cascade.
4. **Limpeza S3**: Invocação de lote do `DeleteObjectsCommand` na AWS.

## Tolerância a Falha e Lixo Digital
Se a AWS recusar o apagamento por instabilidade:
- **Não reverta a deleção de banco**. O Banco de Dados é a Fonte de Verdade da nossa arquitetura. Um produto sem imagens (que não existe no banco) é inofensivo comparado a um banco de dados sujo ou com imagens 404.
- Grave os `keys` não apagados utilizando logs estruturados de erro.
- A requisição prossegue e finaliza com o `Status 200 OK` ou `204 No Content` sem notificar a interface do erro da AWS.
