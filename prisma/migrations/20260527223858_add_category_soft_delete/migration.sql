-- AlterTable
ALTER TABLE "category" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "link_contact" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "enterprise_invite_token_enterprise_id_canceled_at_idx" ON "enterprise_invite_token"("enterprise_id", "canceled_at");
