// apps/web/app/orders/type.ts
export type OrderRow = {
  id: string;
  orderNo: string;
  branchId: string | null;
  businessDate: string;
  status: string;
  netSales: number;
  channel: string;
  orderType: string;
};

