-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierProductSizePrice" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "productSizeId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "TierProductSizePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierModifierItemPrice" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "modifierItemId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "TierModifierItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_code_key" ON "PriceTier"("code");

-- CreateIndex
CREATE INDEX "TierProductSizePrice_productSizeId_idx" ON "TierProductSizePrice"("productSizeId");

-- CreateIndex
CREATE UNIQUE INDEX "TierProductSizePrice_tierId_productSizeId_key" ON "TierProductSizePrice"("tierId", "productSizeId");

-- CreateIndex
CREATE INDEX "TierModifierItemPrice_modifierItemId_idx" ON "TierModifierItemPrice"("modifierItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TierModifierItemPrice_tierId_modifierItemId_key" ON "TierModifierItemPrice"("tierId", "modifierItemId");

-- AddForeignKey
ALTER TABLE "TierProductSizePrice" ADD CONSTRAINT "TierProductSizePrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierProductSizePrice" ADD CONSTRAINT "TierProductSizePrice_productSizeId_fkey" FOREIGN KEY ("productSizeId") REFERENCES "ProductSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierModifierItemPrice" ADD CONSTRAINT "TierModifierItemPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierModifierItemPrice" ADD CONSTRAINT "TierModifierItemPrice_modifierItemId_fkey" FOREIGN KEY ("modifierItemId") REFERENCES "ModifierItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
