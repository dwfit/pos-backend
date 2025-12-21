export type SidebarItem = {
    label: string;
    href?: string;
    icon?: string;
    showIf?: string; // single permission
  };
  
  export type SidebarGroup = {
    label: string;
    icon?: string;
    showIfAny: string[]; // parent rule: any child perm
    children: SidebarItem[];
  };
  
  export const SIDEBAR_TREE: SidebarGroup[] = [
    {
      label: "Dashboard",
      showIfAny: [
        "dashboard.general",
        "dashboard.branches",
        "dashboard.inventory",
        "dashboard.callcenter",
      ],
      children: [
        { label: "General", href: "/dash", showIf: "dashboard.general" },
        { label: "Branches", href: "/dash/branches", showIf: "dashboard.branches" },
        { label: "Inventory", href: "/dash/inventory", showIf: "dashboard.inventory" },
        { label: "Call Center", href: "/dash/callcenter", showIf: "dashboard.callcenter" },
      ],
    },
  
    {
      label: "Orders",
      showIfAny: ["orders.read", "orders.manage", "orders.tags.manage"],
      children: [
        { label: "Orders", href: "/orders", showIf: "orders.read" },
        { label: "Order Tags", href: "/orders/tags", showIf: "orders.tags.manage" },
      ],
    },
  
    {
      label: "Customers",
      showIfAny: ["customers.read", "customers.manage", "customers.insights.read"],
      children: [
        { label: "Customers", href: "/customers", showIf: "customers.read" },
        { label: "Insights", href: "/customers/insights", showIf: "customers.insights.read" },
      ],
    },
  
    {
      label: "Menu",
      showIfAny: ["menu.read", "menu.manage"],
      children: [
        { label: "Menu", href: "/menu", showIf: "menu.read" },
        { label: "Manage Menu", href: "/menu/manage", showIf: "menu.manage" },
      ],
    },
  
    {
      label: "Reports",
      showIfAny: ["reports.sales.view", "reports.costAnalysis.view", "reports.inventoryControl.view"],
      children: [
        { label: "Sales", href: "/reports/sales", showIf: "reports.sales.view" },
        { label: "Cost Analysis", href: "/reports/cost", showIf: "reports.costAnalysis.view" },
        { label: "Inventory Control", href: "/reports/inventory", showIf: "reports.inventoryControl.view" },
      ],
    },
  
    {
      label: "Admin",
      showIfAny: [
        "branches.manage",
        "devices.manage",
        "users.manage",
        "discounts.manage",
        "settings.manage",
        "taxes.manage",
      ],
      children: [
        { label: "Branches", href: "/admin/branches", showIf: "branches.manage" },
        { label: "Devices", href: "/admin/devices", showIf: "devices.manage" },
        { label: "Users", href: "/admin/users", showIf: "users.manage" },
        { label: "Roles", href: "/admin/roles", showIf: "users.manage" }, // or roles.manage if you add it
        { label: "Discounts", href: "/admin/discounts", showIf: "discounts.manage" },
        { label: "Taxes", href: "/admin/taxes", showIf: "taxes.manage" },
        { label: "Settings", href: "/admin/settings", showIf: "settings.manage" },
      ],
    },
  ];
  