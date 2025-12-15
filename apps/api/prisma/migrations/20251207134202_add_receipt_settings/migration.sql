-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "PosReceiptSettings" (
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

    CONSTRAINT "PosReceiptSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
