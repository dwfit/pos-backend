/*
  Warnings:

  - You are about to drop the column `lastSeenAt` on the `PosDevice` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `PosDevice` table. All the data in the column will be lost.
  - Added the required column `status` to the `PosDevice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `PosDevice` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `PosDevice` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "PosDevice" DROP COLUMN "lastSeenAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "status" "PosDeviceStatus" NOT NULL,
ADD COLUMN     "type" "PosDeviceType" NOT NULL,
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "branchId" DROP NOT NULL;
