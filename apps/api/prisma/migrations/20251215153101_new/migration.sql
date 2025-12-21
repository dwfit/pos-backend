-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "additionalNumber" TEXT,
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "buildingNumber" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT DEFAULT 'SAR',
ADD COLUMN     "district" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailDomain" TEXT,
ADD COLUMN     "licenseNo" TEXT,
ADD COLUMN     "licenseType" TEXT,
ADD COLUMN     "logoMediaId" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "Organization_logoMediaId_idx" ON "Organization"("logoMediaId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
