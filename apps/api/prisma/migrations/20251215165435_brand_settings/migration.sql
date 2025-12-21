-- CreateTable
CREATE TABLE "BrandSettings" (
    "id" TEXT NOT NULL,
    "logoUrl" TEXT,
    "printLanguage" TEXT NOT NULL DEFAULT 'MAIN_LOCALIZED',
    "mainLanguage" TEXT NOT NULL DEFAULT 'en',
    "localizedLanguage" TEXT DEFAULT 'ar',
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "invoiceTitle" TEXT DEFAULT 'Simplified Tax Invoice',
    "showOrderNumber" BOOLEAN NOT NULL DEFAULT true,
    "showCalories" BOOLEAN NOT NULL DEFAULT false,
    "showSubtotal" BOOLEAN NOT NULL DEFAULT true,
    "showRounding" BOOLEAN NOT NULL DEFAULT false,
    "showCloserUsername" BOOLEAN NOT NULL DEFAULT false,
    "showCreatorUsername" BOOLEAN NOT NULL DEFAULT false,
    "showCheckNumber" BOOLEAN NOT NULL DEFAULT true,
    "hideFreeModifierOptions" BOOLEAN NOT NULL DEFAULT false,
    "printCustomerPhoneInPickup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandSettings_pkey" PRIMARY KEY ("id")
);
