// apps/api/src/permissions/all-permissions.ts
export const ALL_PERMISSIONS = [
    // Orders
    "orders.read",
    "orders.manage",
    "orders.tags.manage",
  
    // Customers
    "customers.read",
    "customers.insights.read",
    "customers.manage",
    "customers.houseAccount.manage",
    "customers.loyalty.manage",
  
    // Inventory
    "inventory.items.read",
    "inventory.items.manage",
    "inventory.suppliers.read",
    "inventory.suppliers.manage",
    "inventory.po.create",
    "inventory.po.submit",
    "inventory.transfers.create",
    "inventory.counts.create",
  
    // Menu
    "menu.read",
    "menu.manage",
  
    // Admin/Settings
    "branches.manage",
    "settings.manage",
    "taxes.manage",
    "devices.manage",
    "users.manage",
    "discounts.manage",
  
    // Reports
    "reports.costAnalysis.view",
    "reports.inventoryControl.view",
    "reports.sales.view",
  
    // Dashboards
    "dashboard.general",
    "dashboard.branches",
    "dashboard.inventory",
    "dashboard.callcenter",
  
    // POS / cashier app
    "pos.cashRegister",
    "pos.devices.manage",
    "pos.reports.access",
    "pos.discounts.predefined.apply",
    "pos.discounts.open.apply",
    "pos.kitchen.editProducts",
    "pos.orders.join",
    "pos.drawer.operations",
    "pos.eod.perform",
    "pos.print.check",
    "pos.print.receipt",
    "pos.orders.return",
    "pos.orders.split",
    "pos.orders.viewDone",
    "pos.orders.void",
    "pos.payment.perform",
    "pos.orders.editOpenedByOthers",
    "pos.orders.changeTableOwner",
    "pos.kitchen.sendBeforePayment",
    "pos.kitchen.reprint",
    "pos.till.closeWithActiveOrders",
    "pos.payment.payWithoutClosing",
    "pos.orders.tags.manage",
    "pos.productAvailability.manage",
    "pos.orders.applyAhead",
    "pos.driver",
    "pos.spotCheck.perform",
    "pos.openPriceProduct.add",
    "pos.waiter",
  ] as const;
  