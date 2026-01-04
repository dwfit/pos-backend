// apps/api/src/routes/reports.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /reports/sales-summary
 *
 * Query params:
 *  - brandId = optional (if omitted = all brands)
 *
 * Aggregates ALL CLOSED orders.
 */
router.get("/sales-summary", requireAuth, async (req: any, res) => {
  try {
    const { brandId } = req.query as { brandId?: string };

    const orders = await prisma.order.findMany({
      where: {
        status: "CLOSED",
        ...(brandId && brandId !== "ALL" ? { brandId } : {}),
      },
      select: {
        id: true,
        netTotal: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
      },
    });

    let totalSales = 0;

    for (const o of orders) {
      const net =
        (o as any).netTotal ??
        ((Number((o as any).subtotal ?? 0) +
          Number((o as any).taxTotal ?? 0)) -
          Number((o as any).discountTotal ?? 0));
      totalSales += net;
    }

    const orderCount = orders.length;
    const avgTicket = orderCount ? totalSales / orderCount : 0;

    // TODO: fill from payments table later
    const paymentsByMethod: any[] = [];

    console.log(
      "✅ /reports/sales-summary OK",
      "brandId:",
      brandId || "ALL",
      "orders:",
      orderCount,
      "total:",
      totalSales
    );

    return res.json({
      totalSales,
      orderCount,
      avgTicket,
      paymentsByMethod,
    });
  } catch (err) {
    console.error("❌ GET /reports/sales-summary error:", err);
    return res.status(500).json({ error: "sales_summary_failed" });
  }
});

/* ====================================================================
   DETAILED SALES – FILTERS
   GET /reports/detailed-sales/filters
   ==================================================================== */

router.get(
  "/detailed-sales/filters",
  requireAuth,
  async (req: any, res) => {
    try {
      const { brandId } = req.query as { brandId?: string };

      const branchWhere: any = { isActive: true };
      if (brandId && brandId !== "ALL") {
        branchWhere.brandId = brandId;
      }

      const [
        branches,
        customers,
        discounts,
        promotions,
        priceTiers,
      ] = await Promise.all([
        prisma.branch.findMany({
          where: branchWhere,
          select: { id: true, name: true, code: true },
          orderBy: { name: "asc" },
        }),

        prisma.customer.findMany({
          select: { id: true, name: true, phone: true },
          orderBy: { name: "asc" },
        }),

        // Discount model has NO `code` field -> only id + name
        prisma.discount.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),

        // Promotion model has NO `code` field -> only id + name
        prisma.promotion.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),

        // PriceTier DOES have `code` in your schema
        prisma.priceTier.findMany({
          select: { id: true, name: true, code: true },
          orderBy: { name: "asc" },
        }),
      ]);

      // For now we’re not loading productSizes (we’ll wire line-items later)
      const productSizes: any[] = [];

      return res.json({
        branches,
        productSizes,
        customers,
        discounts,
        promotions,
        priceTiers,
      });
    } catch (err) {
      console.error(
        "❌ GET /reports/detailed-sales/filters error:",
        err
      );
      return res.status(500).json({
        error: "detailed_sales_filters_failed",
        message: "Failed to load detailed-sales filters",
      });
    }
  }
);

/* ====================================================================
   DETAILED SALES – DATA (order-level for now)
   GET /reports/detailed-sales
   ==================================================================== */

router.get(
  "/detailed-sales",
  requireAuth,
  async (req: any, res) => {
    try {
      const {
        startDate,
        endDate,
        branchId,
        customerId,
        brandId,
      } = req.query as {
        startDate?: string;
        endDate?: string;
        branchId?: string;
        customerId?: string;
        brandId?: string;
      };

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: "invalid_dates",
          message: "startDate and endDate are required",
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // inclusive end

      const orderWhere: any = {
        status: "CLOSED",
        businessDate: {
          gte: start,
          lte: end,
        },
      };

      if (branchId) orderWhere.branchId = branchId;
      if (customerId) orderWhere.customerId = customerId;
      if (brandId && brandId !== "ALL") orderWhere.brandId = brandId;

      const orders = await prisma.order.findMany({
        where: orderWhere,
        select: {
          id: true,
          businessDate: true,
          createdAt: true,
          orderType: true,
          channel: true,
          branchId: true,
          customerId: true,
          netTotal: true,
          subtotal: true,
          discountTotal: true,
          taxTotal: true,
        },
        orderBy: [
          { businessDate: "asc" },
          { createdAt: "asc" },
        ],
      });

      const branchIds = Array.from(
        new Set(orders.map((o) => o.branchId).filter(Boolean))
      ) as string[];
      const customerIds = Array.from(
        new Set(orders.map((o) => o.customerId).filter(Boolean))
      ) as string[];

      const [branches, customers] = await Promise.all([
        branchIds.length
          ? prisma.branch.findMany({
              where: { id: { in: branchIds } },
              select: { id: true, name: true },
            })
          : Promise.resolve([]),
        customerIds.length
          ? prisma.customer.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true, phone: true },
            })
          : Promise.resolve([]),
      ]);

      const branchMap = new Map(branches.map((b) => [b.id, b]));
      const customerMap = new Map(
        customers.map((c) => [c.id, c])
      );

      const rows = orders.map((o) => {
        const branch = o.branchId
          ? branchMap.get(o.branchId as string)
          : null;
        const customer = o.customerId
          ? customerMap.get(o.customerId as string)
          : null;

        const createdAt = o.createdAt
          ? new Date(o.createdAt)
          : null;

        const net = (o as any).netTotal as number | null;
        const subtotal = Number((o as any).subtotal ?? 0);
        const taxTotal = Number((o as any).taxTotal ?? 0);
        const discountTotal = Number(
          (o as any).discountTotal ?? 0
        );

        const netAmount =
          net ?? subtotal + taxTotal - discountTotal;
        const grossAmount = netAmount + discountTotal;
        const discountAmount = discountTotal;

        return {
          orderId: o.id,
          businessDate: o.businessDate
            ? new Date(o.businessDate).toISOString().slice(0, 10)
            : "",
          orderTime: createdAt
            ? createdAt.toTimeString().slice(0, 5)
            : "",
          branchName: branch?.name ?? "",
          orderType: (o as any).orderType ?? "",
          channel: (o as any).channel ?? "",
          productName: "", // not yet wired to line items
          sizeName: "",
          quantity: 0,
          unitPrice: netAmount,
          grossAmount,
          discountAmount,
          netAmount,
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
          discountName: null,
          promotionName: null,
          priceTierName: null,
        };
      });

      console.log(
        "✅ /reports/detailed-sales OK",
        "orders:",
        orders.length,
        "rows:",
        rows.length
      );

      return res.json({ rows });
    } catch (err) {
      console.error("❌ GET /reports/detailed-sales error:", err);
      return res.status(500).json({
        error: "detailed_sales_failed",
        message: "Failed to load detailed-sales report",
      });
    }
  }
);

/* ====================================================================
   DETAILED PAYMENTS – FILTERS
   GET /reports/detailed-payments/filters
   ==================================================================== */

router.get(
  "/detailed-payments/filters",
  requireAuth,
  async (req: any, res) => {
    try {
      const { brandId } = req.query as { brandId?: string };
      const prismaAny = prisma as any;

      const branchWhere: any = { isActive: true };
      if (brandId && brandId !== "ALL") {
        branchWhere.brandId = brandId;
      }

      const [branches, customers, paymentMethodsRaw, paymentTypesRaw] =
        await Promise.all([
          prisma.branch.findMany({
            where: branchWhere,
            select: { id: true, name: true, code: true },
            orderBy: { name: "asc" },
          }),

          prisma.customer.findMany({
            select: { id: true, name: true, phone: true },
            orderBy: { name: "asc" },
          }),

          prismaAny.paymentMethod
            ? prismaAny.paymentMethod.findMany({})
            : Promise.resolve([]),

          prismaAny.paymentType
            ? prismaAny.paymentType.findMany({})
            : Promise.resolve([]),
        ]);

      const paymentMethods = (paymentMethodsRaw as any[]).map((m) => ({
        id: m.id,
        name: m.name ?? "",
        code: m.code ?? null,
      }));

      const paymentTypes = (paymentTypesRaw as any[]).map((t) => ({
        id: t.id,
        name: t.name ?? "",
        code: t.code ?? null,
      }));

      console.log(
        "✅ /reports/detailed-payments/filters OK",
        "branches:",
        branches.length,
        "customers:",
        customers.length,
        "methods:",
        paymentMethods.length,
        "types:",
        paymentTypes.length
      );

      return res.json({
        branches,
        customers,
        paymentMethods,
        paymentTypes,
      });
    } catch (err) {
      console.error(
        "❌ GET /reports/detailed-payments/filters error:",
        err
      );
      return res.status(500).json({
        error: "detailed_payments_filters_failed",
        message: "Failed to load detailed-payments filters",
      });
    }
  }
);

/* ====================================================================
   DETAILED PAYMENTS – DATA
   GET /reports/detailed-payments
   ==================================================================== */

router.get(
  "/detailed-payments",
  requireAuth,
  async (req: any, res) => {
    try {
      const {
        startDate,
        endDate,
        branchId,
        customerId,
        paymentMethodId,
        paymentTypeId,
        brandId,
      } = req.query as {
        startDate?: string;
        endDate?: string;
        branchId?: string;
        customerId?: string;
        paymentMethodId?: string;
        paymentTypeId?: string;
        brandId?: string;
      };

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: "invalid_dates",
          message: "startDate and endDate are required",
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const prismaAny = prisma as any;

      // Try to locate a payments model: OrderPayment or Payment.
      const paymentModel =
        prismaAny.orderPayment || prismaAny.payment;

      if (!paymentModel) {
        console.warn(
          "⚠️ No payment model (orderPayment / payment) on Prisma client"
        );
        return res.json({ rows: [] });
      }

      // VERY defensive: no where/select/orderBy here -> avoid schema mismatches.
      const allPayments: any[] = await paymentModel.findMany({});

      console.log(
        "ℹ️ /reports/detailed-payments allPayments:",
        allPayments.length
      );

      // Filter in JS, only using fields if they exist.
      const filtered = allPayments.filter((p) => {
        // choose a date field: businessDate || paymentDate || date || createdAt
        const rawDate =
          p.businessDate ||
          p.paymentDate ||
          p.date ||
          p.createdAt;

        if (!rawDate) return false;

        const date = new Date(rawDate);
        if (date < start || date > end) return false;

        if (branchId && p.branchId && p.branchId !== branchId)
          return false;

        if (
          brandId &&
          brandId !== "ALL" &&
          p.brandId &&
          p.brandId !== brandId
        )
          return false;

        if (
          customerId &&
          p.customerId &&
          p.customerId !== customerId
        )
          return false;

        const methodId =
          p.paymentMethodId || p.methodId || p.method_id;
        if (
          paymentMethodId &&
          methodId &&
          methodId !== paymentMethodId
        )
          return false;

        const typeId =
          p.paymentTypeId || p.typeId || p.type_id;
        if (
          paymentTypeId &&
          typeId &&
          typeId !== paymentTypeId
        )
          return false;

        return true;
      });

      console.log(
        "ℹ️ /reports/detailed-payments filtered:",
        filtered.length
      );

      // Collect IDs for joins
      const orderIds = Array.from(
        new Set(
          filtered
            .map((p) => p.orderId || p.order_id)
            .filter(Boolean)
        )
      ) as string[];

      const branchIds = Array.from(
        new Set(
          filtered
            .map((p) => p.branchId || p.branch_id)
            .filter(Boolean)
        )
      ) as string[];

      const customerIds = Array.from(
        new Set(
          filtered
            .map((p) => p.customerId || p.customer_id)
            .filter(Boolean)
        )
      ) as string[];

      const methodIds = Array.from(
        new Set(
          filtered
            .map(
              (p) =>
                p.paymentMethodId ||
                p.methodId ||
                p.method_id
            )
            .filter(Boolean)
        )
      ) as string[];

      const typeIds = Array.from(
        new Set(
          filtered
            .map(
              (p) =>
                p.paymentTypeId ||
                p.typeId ||
                p.type_id
            )
            .filter(Boolean)
        )
      ) as string[];

      const [
        orders,
        branches,
        customers,
        methodsRaw,
        typesRaw,
      ] = await Promise.all([
        orderIds.length
          ? prisma.order.findMany({
              where: { id: { in: orderIds } },
              select: {
                id: true,
                businessDate: true,
                createdAt: true,
                orderType: true,
                channel: true,
                branchId: true,
                customerId: true,
              },
            })
          : Promise.resolve([]),

        branchIds.length
          ? prisma.branch.findMany({
              where: { id: { in: branchIds } },
              select: { id: true, name: true },
            })
          : Promise.resolve([]),

        customerIds.length
          ? prisma.customer.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true, phone: true },
            })
          : Promise.resolve([]),

        methodsRawOrEmpty(prismaAny, methodIds),
        typesRawOrEmpty(prismaAny, typeIds),
      ]);

      const orderMap = new Map(orders.map((o: any) => [o.id, o]));
      const branchMap = new Map(branches.map((b: any) => [b.id, b]));
      const customerMap = new Map(
        customers.map((c: any) => [c.id, c])
      );
      const methodMap = new Map(
        (methodsRaw as any[]).map((m) => [m.id, m])
      );
      const typeMap = new Map(
        (typesRaw as any[]).map((t) => [t.id, t])
      );

      const rows = filtered.map((p) => {
        const orderId = p.orderId || p.order_id || "";
        const order = orderId ? orderMap.get(orderId) || {} : {};
        const branchIdReal =
          (order as any).branchId ||
          p.branchId ||
          p.branch_id;
        const customerIdReal =
          (order as any).customerId ||
          p.customerId ||
          p.customer_id;

        const branch = branchIdReal
          ? branchMap.get(branchIdReal)
          : null;
        const customer = customerIdReal
          ? customerMap.get(customerIdReal)
          : null;

        const methodIdReal =
          p.paymentMethodId || p.methodId || p.method_id;
        const typeIdReal =
          p.paymentTypeId || p.typeId || p.type_id;

        const method = methodIdReal
          ? methodMap.get(methodIdReal)
          : null;
        const type = typeIdReal
          ? typeMap.get(typeIdReal)
          : null;

        const dateSource =
          (order as any).businessDate ||
          p.businessDate ||
          p.paymentDate ||
          p.date ||
          p.createdAt;

        const timeSource =
          (order as any).createdAt ||
          p.createdAt ||
          p.businessDate ||
          p.paymentDate;

        const dateStr = dateSource
          ? new Date(dateSource).toISOString().slice(0, 10)
          : "";
        const timeStr = timeSource
          ? new Date(timeSource).toTimeString().slice(0, 5)
          : "";

        // amount/net/change: try several common field names
        const amount =
          Number(
            p.amount ??
              p.totalAmount ??
              p.value ??
              0
          ) || 0;

        const changeAmount =
          Number(
            p.changeAmount ??
              p.change ??
              p.change_value ??
              0
          ) || 0;

        const netAmount =
          p.netAmount != null
            ? Number(p.netAmount)
            : amount - changeAmount;

        return {
          paymentId: p.id,
          orderId,
          businessDate: dateStr,
          orderTime: timeStr,
          branchName: branch?.name ?? "",
          orderType: (order as any).orderType ?? "",
          channel: (order as any).channel ?? "",
          methodName: method?.name ?? "",
          typeName: type?.name ?? null,
          amount,
          changeAmount,
          netAmount,
          customerName: customer?.name ?? null,
          customerPhone: customer?.phone ?? null,
          reference:
            p.reference ||
            p.ref ||
            p.transactionId ||
            p.txnId ||
            null,
        };
      });

      console.log(
        "✅ /reports/detailed-payments OK",
        "rows:",
        rows.length
      );

      return res.json({ rows });
    } catch (err) {
      console.error(
        "❌ GET /reports/detailed-payments error:",
        err
      );
      return res.status(500).json({
        error: "detailed_payments_failed",
        message: "Failed to load detailed-payments report",
      });
    }
  }
);

// helper functions for methods/types
async function methodsRawOrEmpty(
  prismaAny: any,
  ids: string[]
) {
  if (!ids.length) return [];
  if (!prismaAny.paymentMethod) return [];
  return prismaAny.paymentMethod.findMany({
    where: { id: { in: ids } },
  });
}

async function typesRawOrEmpty(
  prismaAny: any,
  ids: string[]
) {
  if (!ids.length) return [];
  if (!prismaAny.paymentType) return [];
  return prismaAny.paymentType.findMany({
    where: { id: { in: ids } },
  });
}

export default router;
