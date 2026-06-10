-- DropForeignKey
ALTER TABLE "product" DROP CONSTRAINT "product_user_id_fkey";

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
