/*
  Warnings:

  - You are about to drop the column `deviceId` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `reference` on the `PosDevice` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `PosDevice` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `PosDevice` table. All the data in the column will be lost.
  - You are about to drop the column `lastLoginAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[deviceCode]` on the table `PosDevice` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `platform` on the `Device` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `activationKeyHash` on table `Device` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `deviceCode` to the `PosDevice` table without a default value. This is not possible if the table is not empty.
  - Made the column `branchId` on table `PosDevice` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('android', 'ios');

-- DropForeignKey
ALTER TABLE "public"."Device" DROP CONSTRAINT "Device_branchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PosDevice" DROP CONSTRAINT "PosDevice_branchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserBranch" DROP CONSTRAINT "UserBranch_branchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserBranch" DROP CONSTRAINT "UserBranch_userId_fkey";

-- DropIndex
DROP INDEX "public"."PosDevice_reference_key";

-- AlterTable
ALTER TABLE "Device" DROP COLUMN "deviceId",
DROP COLUMN "expiresAt",
DROP COLUMN "status",
DROP COLUMN "platform",
ADD COLUMN     "platform" "DevicePlatform" NOT NULL,
ALTER COLUMN "activationKeyHash" SET NOT NULL;

-- AlterTable
ALTER TABLE "PosDevice" DROP COLUMN "reference",
DROP COLUMN "status",
DROP COLUMN "type",
ADD COLUMN     "deviceCode" TEXT NOT NULL,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "branchId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "lastLoginAt",
DROP COLUMN "phone",
DROP COLUMN "role",
DROP COLUMN "status",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "roleId" TEXT,
ALTER COLUMN "name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserBranch" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "idx_device_branchId" ON "Device"("branchId");

-- CreateIndex
CREATE INDEX "idx_order_branchId" ON "Order"("branchId");

-- CreateIndex
CREATE INDEX "idx_order_customerId" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "idx_order_businessDate" ON "Order"("businessDate");

-- CreateIndex
CREATE INDEX "idx_order_createdAt" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "idx_orderitem_orderId" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "idx_payment_orderId" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PosDevice_deviceCode_key" ON "PosDevice"("deviceCode");

-- CreateIndex
CREATE INDEX "idx_posdevice_branchId" ON "PosDevice"("branchId");

-- CreateIndex
CREATE INDEX "idx_userbranch_branchId" ON "UserBranch"("branchId");

-- CreateIndex
CREATE INDEX "idx_userbranch_userId" ON "UserBranch"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
