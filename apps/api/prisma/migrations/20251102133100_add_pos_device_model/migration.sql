-- CreateEnum
CREATE TYPE "PosDeviceStatus" AS ENUM ('USED', 'NOT_USED');

-- CreateEnum
CREATE TYPE "PosDeviceType" AS ENUM ('CASHIER', 'KDS', 'NOTIFIER', 'DISPLAY', 'SUB_CASHIER');

-- CreateTable
CREATE TABLE "PosDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PosDeviceStatus" NOT NULL DEFAULT 'NOT_USED',
    "type" "PosDeviceType" NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosDevice_reference_key" ON "PosDevice"("reference");

-- AddForeignKey
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
