-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('BASIC', 'ADVANCED');

-- CreateEnum
CREATE TYPE "PromotionDiscountType" AS ENUM ('VALUE', 'PERCENT');

-- CreateEnum
CREATE TYPE "PromotionConditionKind" AS ENUM ('BUYS_QUANTITY', 'SPENDS_AMOUNT');

-- CreateEnum
CREATE TYPE "PromotionRewardKind" AS ENUM ('DISCOUNT_ON_ORDER', 'DISCOUNT_ON_PRODUCT', 'PAY_FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLocalized" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startTimeMins" INTEGER NOT NULL DEFAULT 0,
    "endTimeMins" INTEGER NOT NULL DEFAULT 1439,
    "daysCsv" TEXT NOT NULL DEFAULT 'SUN,MON,TUE,WED,THU,FRI,SAT',
    "orderTypesCsv" TEXT NOT NULL DEFAULT 'DINE_IN,PICKUP,DELIVERY,DRIVE_THRU',
    "priority" INTEGER,
    "includeModifiers" BOOLEAN NOT NULL DEFAULT false,
    "promotionType" "PromotionType" NOT NULL DEFAULT 'BASIC',
    "basicDiscountType" "PromotionDiscountType",
    "basicDiscountValue" DOUBLE PRECISION,
    "conditionKind" "PromotionConditionKind",
    "conditionQty" INTEGER,
    "conditionSpend" DOUBLE PRECISION,
    "rewardKind" "PromotionRewardKind",
    "rewardDiscountType" "PromotionDiscountType",
    "rewardDiscountValue" DOUBLE PRECISION,
    "rewardFixedAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionBranch" (
    "promotionId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "PromotionBranch_pkey" PRIMARY KEY ("promotionId","branchId")
);

-- CreateTable
CREATE TABLE "PromotionProduct" (
    "promotionId" TEXT NOT NULL,
    "productSizeId" TEXT NOT NULL,

    CONSTRAINT "PromotionProduct_pkey" PRIMARY KEY ("promotionId","productSizeId")
);

-- CreateTable
CREATE TABLE "PromotionCustomerTag" (
    "promotionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "PromotionCustomerTag_pkey" PRIMARY KEY ("promotionId","tagId")
);

-- AddForeignKey
ALTER TABLE "PromotionBranch" ADD CONSTRAINT "PromotionBranch_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBranch" ADD CONSTRAINT "PromotionBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_productSizeId_fkey" FOREIGN KEY ("productSizeId") REFERENCES "ProductSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCustomerTag" ADD CONSTRAINT "PromotionCustomerTag_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
