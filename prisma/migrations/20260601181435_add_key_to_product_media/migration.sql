/*
  Warnings:

  - Added the required column `key` to the `product_media` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "product_media" ADD COLUMN     "key" TEXT NOT NULL;
