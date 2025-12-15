/*
  Warnings:

  - You are about to drop the column `desc` on the `Role` table. All the data in the column will be lost.
  - Added the required column `permissions` to the `Role` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Role_name_key";

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "desc",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "permissions" JSONB NOT NULL;
