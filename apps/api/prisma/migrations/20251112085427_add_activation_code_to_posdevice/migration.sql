-- AlterTable
ALTER TABLE "PosDevice" ADD COLUMN     "activationCode" VARCHAR(6),
ADD COLUMN     "activationCodeGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "platform" TEXT;
