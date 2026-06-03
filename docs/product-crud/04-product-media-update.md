# 04 - Gerenciamento de Mídias (Delta Update)

## Estratégia de Mídia Principal (`isMain`)
Um produto em exibição na loja exige capa. Caso a mídia principal atual não venha no array de `keepMediaIds` (ou seja, foi removida):
1. A primeira imagem sobrevivente (presente em `keepMediaIds`) assumirá `isMain = true`.
2. Se nenhuma for mantida (restarem 0), a primeira **nova imagem subida** assumirá a coroa.
3. Se ao final não sobrar nenhuma imagem (`FOTO = 0`), a operação é bloqueada de imediato com erro HTTP 400.

## Fluxo
1. Autorizar ação `update`. Validar duplicidade (`Set` no Zod) e pertencimento das `keepMediaIds`.
2. Validar limite (Mídias Mantidas + Novas <= 3 fotos, 1 vídeo).
3. Subir novas mídias via Multer/S3.
4. Transação Prisma:
   - Apagar antigas de `ProductMedia`.
   - Adicionar novas.
   - Setar a nova regra de `isMain`.

## Estratégia de Fallback no S3
**Se a transação do banco falhar:** Um catch reverte os uploads das novas fotos recém chegadas usando os `uploadedKeys`. O usuário recebe `500 Internal Error`.
**Se a transação do banco for sucesso:** A API assíncrona tentará limpar os arquivos antigos que foram abandonados (`DeleteObjectsCommand`). Se a limpeza **falhar**, a API **não aciona rollback no banco**. O banco está seguro; os logs documentam as chaves abandonadas e a resposta `200 OK` é entregue ao Frontend.
