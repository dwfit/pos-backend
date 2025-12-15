-- CreateTable
CREATE TABLE "BranchTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "BranchTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchTag_name_idx" ON "BranchTag"("name");

-- AddForeignKey
ALTER TABLE "BranchTag" ADD CONSTRAINT "BranchTag_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
