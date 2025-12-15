-- AlterTable
ALTER TABLE "ModifierGroup" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ModifierItem" ADD COLUMN     "deletedAt" TIMESTAMP(3);
