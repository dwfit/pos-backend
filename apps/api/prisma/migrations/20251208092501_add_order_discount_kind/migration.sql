-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountKind" "DiscountType",
ADD COLUMN     "discountValue" DECIMAL(12,2);
