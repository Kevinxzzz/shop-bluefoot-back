-- DropForeignKey
ALTER TABLE "enterprise_invite_token" DROP CONSTRAINT "enterprise_invite_token_criado_por_admin_id_fkey";

-- AddForeignKey
ALTER TABLE "enterprise_invite_token" ADD CONSTRAINT "enterprise_invite_token_criado_por_admin_id_fkey" FOREIGN KEY ("criado_por_admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
