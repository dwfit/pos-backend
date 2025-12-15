export type Permission =
  | 'orders.read' | 'orders.write' | 'orders.refund'
  | 'menu.read' | 'menu.write'
  | 'inventory.read' | 'inventory.write'
  | 'devices.read' | 'devices.write'
  | 'customers.read' | 'customers.write'
  | 'reports.read' | 'manage.admin';

export const rolePermissions: Record<string, Permission[]> = {
  admin: ['manage.admin','orders.read','orders.write','orders.refund','menu.read','menu.write','inventory.read','inventory.write','devices.read','devices.write','customers.read','customers.write','reports.read'],
  manager: ['orders.read','orders.write','orders.refund','menu.read','inventory.read','devices.read','customers.read','reports.read'],
  cashier: ['orders.read','orders.write','menu.read','customers.read'],
  viewer: ['orders.read','menu.read','reports.read']
};
