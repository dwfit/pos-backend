-- CreateTable
CREATE TABLE "DeviceSetting" (
    "deviceId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceSetting_pkey" PRIMARY KEY ("deviceId")
);

-- AddForeignKey
ALTER TABLE "DeviceSetting" ADD CONSTRAINT "DeviceSetting_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PosDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
