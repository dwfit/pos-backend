-- CreateTable
CREATE TABLE "PosCallCenterSettings" (
    "id" TEXT NOT NULL,
    "agents" TEXT,
    "acceptedPaymentModes" JSONB,
    "inactiveBranches" TEXT,
    "menuGroup" TEXT,
    "inactiveOrderTypes" TEXT,
    "allowDiscounts" BOOLEAN NOT NULL DEFAULT true,
    "allowCoupons" BOOLEAN NOT NULL DEFAULT false,
    "allowEditingOrders" BOOLEAN NOT NULL DEFAULT false,
    "allowVoidingActive" BOOLEAN NOT NULL DEFAULT false,
    "allowReadAllCcOrders" BOOLEAN NOT NULL DEFAULT true,
    "allowReadAllDcOrders" BOOLEAN NOT NULL DEFAULT true,
    "allowPriceTags" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosCallCenterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCashierAppSettings" (
    "id" TEXT NOT NULL,
    "presetTenderedAmounts" TEXT,
    "tenderedAmountCurrencies" TEXT,
    "predefinedTipPercentages" TEXT,
    "uploadOrdersDelayMinutes" INTEGER NOT NULL DEFAULT 0,
    "inactiveUsersLogoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "returnMode" TEXT NOT NULL DEFAULT 'LIMITED',
    "limitedReturnPeriodMinutes" INTEGER,
    "requireOrderTagsForOrders" TEXT,
    "roundingMethod" TEXT DEFAULT 'NONE',
    "enableTips" BOOLEAN NOT NULL DEFAULT false,
    "discountsRequireCustomerInfo" BOOLEAN NOT NULL DEFAULT false,
    "voidRequiresCustomerInfo" BOOLEAN NOT NULL DEFAULT false,
    "requireTableGuestForDineIn" BOOLEAN NOT NULL DEFAULT false,
    "alwaysAskVoidReasons" BOOLEAN NOT NULL DEFAULT false,
    "autoSendToKitchenAfterFullPayment" BOOLEAN NOT NULL DEFAULT true,
    "autoDataSyncAtStartOfDay" BOOLEAN NOT NULL DEFAULT false,
    "autoPrintProductMix" BOOLEAN NOT NULL DEFAULT true,
    "autoPrintTillReports" BOOLEAN NOT NULL DEFAULT false,
    "forceInventoryCountBeforeEndOfDay" BOOLEAN NOT NULL DEFAULT false,
    "autoCloseKioskOrders" BOOLEAN NOT NULL DEFAULT false,
    "preventSellingOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "printPaymentReceiptsForActiveOrders" BOOLEAN NOT NULL DEFAULT false,
    "singleTillMode" BOOLEAN NOT NULL DEFAULT false,
    "requireCustomerInfoBeforeClosing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosCashierAppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosDisplayAppSettings" (
    "id" TEXT NOT NULL,
    "backgroundImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosDisplayAppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosKitchenSettings" (
    "id" TEXT NOT NULL,
    "sortingMethod" TEXT NOT NULL DEFAULT 'MENU_CATEGORY',
    "showDefaultModifiersOnKds" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosKitchenSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosInventorySettings" (
    "id" TEXT NOT NULL,
    "logoUrl" TEXT,
    "header" TEXT,
    "footer" TEXT,
    "restrictToAvailableQuantities" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosInventorySettings_pkey" PRIMARY KEY ("id")
);
