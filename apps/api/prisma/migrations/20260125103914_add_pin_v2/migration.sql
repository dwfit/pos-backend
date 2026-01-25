-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loginPinHashV2" TEXT,
ADD COLUMN     "loginPinSalt" TEXT;
