/*
  Warnings:

  - The `step` column on the `DeviceSyncEvent` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `DeviceSyncEvent` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `mode` on the `DeviceSyncJob` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `DeviceSyncJob` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('push', 'pull', 'push_pull');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('queued', 'running', 'done', 'error');

-- CreateEnum
CREATE TYPE "SyncStep" AS ENUM ('pulled_settings', 'applied_settings', 'pushed_data', 'heartbeat');

-- AlterTable
ALTER TABLE "DeviceSyncEvent" DROP COLUMN "step",
ADD COLUMN     "step" "SyncStep",
DROP COLUMN "status",
ADD COLUMN     "status" "SyncStatus";

-- AlterTable
ALTER TABLE "DeviceSyncJob" DROP COLUMN "mode",
ADD COLUMN     "mode" "SyncMode" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "SyncStatus" NOT NULL;

-- CreateIndex
CREATE INDEX "DeviceSyncEvent_jobId_idx" ON "DeviceSyncEvent"("jobId");

-- CreateIndex
CREATE INDEX "DeviceSyncEvent_deviceId_createdAt_idx" ON "DeviceSyncEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceSyncJob_deviceId_idx" ON "DeviceSyncJob"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceSyncJob_status_createdAt_idx" ON "DeviceSyncJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DeviceSyncJob" ADD CONSTRAINT "DeviceSyncJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSyncEvent" ADD CONSTRAINT "DeviceSyncEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DeviceSyncJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSyncEvent" ADD CONSTRAINT "DeviceSyncEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
