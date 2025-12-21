/*
  Warnings:

  - The `channel` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('POS', 'CALLCENTER');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "posPolicy" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "channel",
ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'POS';
