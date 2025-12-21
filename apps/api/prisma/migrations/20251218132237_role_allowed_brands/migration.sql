-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "allowedOrganization" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RoleBrand" (
    "roleId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,

    CONSTRAINT "RoleBrand_pkey" PRIMARY KEY ("roleId","brandId")
);

-- CreateIndex
CREATE INDEX "RoleBrand_brandId_idx" ON "RoleBrand"("brandId");

-- AddForeignKey
ALTER TABLE "RoleBrand" ADD CONSTRAINT "RoleBrand_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleBrand" ADD CONSTRAINT "RoleBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
