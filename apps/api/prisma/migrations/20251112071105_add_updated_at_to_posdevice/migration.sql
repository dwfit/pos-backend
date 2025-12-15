-- Keep FK behavior stable while we alter the table
ALTER TABLE "PosDevice" DROP CONSTRAINT IF EXISTS "PosDevice_branchId_fkey";

-- 1) Add column WITH a default so existing rows get a value
ALTER TABLE "PosDevice"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2) Drop the default so Prisma's @updatedAt controls future updates
ALTER TABLE "PosDevice"
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Recreate FK exactly as your schema expects (branchId is optional)
ALTER TABLE "PosDevice"
ADD CONSTRAINT "PosDevice_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
