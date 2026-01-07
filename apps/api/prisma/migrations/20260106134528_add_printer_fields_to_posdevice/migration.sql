/*
  Warnings:

  - You are about to alter the column `openingCash` on the `TillSession` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `closingCash` on the `TillSession` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.

*/
-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('PRINTER', 'KDS', 'DISPLAY', 'NOTIFIER', 'PAYMENT_TERMINAL', 'SUB_CASHIER', 'WAITER');

-- AlterTable
ALTER TABLE "PosDevice" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "printerCategory" TEXT,
ADD COLUMN     "printerEnabledOrderTypes" JSONB,
ADD COLUMN     "printerModel" TEXT;

-- AlterTable
ALTER TABLE "TillSession" ALTER COLUMN "openingCash" DROP DEFAULT,
ALTER COLUMN "openingCash" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "closingCash" SET DATA TYPE DECIMAL(12,2);
