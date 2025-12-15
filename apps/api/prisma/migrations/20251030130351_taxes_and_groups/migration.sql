-- CreateTable
CREATE TABLE "Tax" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxGroup" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxGroupItem" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "taxId" INTEGER NOT NULL,

    CONSTRAINT "TaxGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tax_name_key" ON "Tax"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TaxGroup_name_key" ON "TaxGroup"("name");

-- CreateIndex
CREATE INDEX "TaxGroupItem_groupId_idx" ON "TaxGroupItem"("groupId");

-- CreateIndex
CREATE INDEX "TaxGroupItem_taxId_idx" ON "TaxGroupItem"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxGroupItem_groupId_taxId_key" ON "TaxGroupItem"("groupId", "taxId");

-- AddForeignKey
ALTER TABLE "TaxGroupItem" ADD CONSTRAINT "TaxGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TaxGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxGroupItem" ADD CONSTRAINT "TaxGroupItem_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE CASCADE ON UPDATE CASCADE;
