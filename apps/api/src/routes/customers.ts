// apps/api/src/routes/customers.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

/* ===================== LIST (for /customers page) ===================== */

router.get("/customers", requireAuth, async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);

    if (!Number.isFinite(page) || page < 1) {
      return res.status(400).json({ error: "Invalid page" });
    }
    if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 200) {
      return res.status(400).json({ error: "Invalid pageSize" });
    }

    // global stats for header cards
    const [totalCustomers, totalOrders, activeCustomers, lastOrder] =
      await Promise.all([
        prisma.customer.count(),
        prisma.order.count(), // all orders
        prisma.customer.count({
          where: { orders: { some: {} } },
        }),
        prisma.order.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);

    const lastActiveAt = lastOrder?.createdAt ?? null;

    // customers for this page only
    const customers = await prisma.customer.findMany({
      orderBy: { name: "asc" }, // or createdAt if you prefer
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        _count: {
          select: { orders: true },
        },
        orders: {
          orderBy: { createdAt: "desc" }, // or closedAt
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const rows = customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      totalOrders: c._count.orders,
      lastOrderAt: c.orders[0]?.createdAt?.toISOString() ?? null,
    }));

    const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));

    res.json({
      rows,
      page,
      pageSize,
      totalPages,
      totalCustomers,
      totalOrders,
      activeCustomers,
      lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
    });
  } catch (err) {
    console.error("GET /api/customers error:", err);
    res.status(500).json({ error: "Failed to load customers" });
  }
});

/* ===================== DETAIL (for /customers/:id page) ===================== */

router.get("/customers/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        orders: {
          orderBy: { closedAt: "desc" }, // or createdAt
          select: {
            id: true,
            orderNo: true,
            netTotal: true,        // likely Decimal or string
            discountTotal: true,   // same
            closedAt: true,
            createdAt: true,
            branch: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const doneOrders = customer.orders.length;

    // convert totals to number explicitly
    const totalSpent = customer.orders.reduce((sum, o) => {
      const val =
        o.netTotal && typeof o.netTotal === "object" && "toNumber" in o.netTotal
          ? (o.netTotal as any).toNumber()
          : Number(o.netTotal ?? 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const totalDiscounts = customer.orders.reduce((sum, o) => {
      const val =
        o.discountTotal &&
        typeof o.discountTotal === "object" &&
        "toNumber" in o.discountTotal
          ? (o.discountTotal as any).toNumber()
          : Number(o.discountTotal ?? 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const lastOrder = customer.orders[0];
    const lastOrderAt =
      lastOrder?.closedAt ?? lastOrder?.createdAt ?? null;

    const favouriteBranch = lastOrder?.branch?.name ?? null;

    const orders = customer.orders.map((o) => {
      const net =
        o.netTotal && typeof o.netTotal === "object" && "toNumber" in o.netTotal
          ? (o.netTotal as any).toNumber()
          : Number(o.netTotal ?? 0);

      const disc =
        o.discountTotal &&
        typeof o.discountTotal === "object" &&
        "toNumber" in o.discountTotal
          ? (o.discountTotal as any).toNumber()
          : Number(o.discountTotal ?? 0);

      return {
        id: o.id,
        orderNo: o.orderNo,
        netTotal: isNaN(net) ? 0 : net,
        discountTotal: isNaN(disc) ? 0 : disc,
        closedAt: o.closedAt,
        createdAt: o.createdAt,
        branch: o.branch?.name ?? null,
      };
    });

    res.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      doneOrders,
      totalSpent,
      totalDiscounts,
      lastOrderAt,
      favouriteProduct: null,
      favouriteBranch,
      orders,
    });
  } catch (err) {
    console.error("GET /api/customers/:id error:", err);
    res.status(500).json({ error: "Failed to load customer detail" });
  }
});

/* ===================== CUSTOMER → ALL ORDERS (with filters) ===================== */

router.get("/customers/:id/orders", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 10);
    const search = (req.query.search as string | undefined)?.trim();
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const branchId = req.query.branchId as string | undefined;

    if (!Number.isFinite(page) || page < 1) {
      return res.status(400).json({ error: "Invalid page" });
    }
    if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 200) {
      return res.status(400).json({ error: "Invalid pageSize" });
    }

    const where: any = {
      customerId: id,
    };

    if (search) {
      where.orderNo = { contains: search, mode: "insensitive" };
    }

    if (branchId) {
      where.branchId = branchId;
    }

    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom) {
        range.gte = new Date(dateFrom + "T00:00:00.000Z");
      }
      if (dateTo) {
        // inclusive end of day
        range.lte = new Date(dateTo + "T23:59:59.999Z");
      }
      where.closedAt = range; // filter by closedAt range
    }

    function decimalToNumber(val: any): number {
      if (val == null) return 0;
      if (typeof val === "number") return val;
      if (typeof val === "string") return Number(val) || 0;
      if (typeof val === "object" && "toNumber" in val) {
        return (val as any).toNumber();
      }
      return 0;
    }

    // Get customer name for header
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { name: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // total orders (for pagination)
    const totalOrders = await prisma.order.count({ where });

    // paginated orders
    const orders = await prisma.order.findMany({
      where,
      orderBy: { closedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        orderNo: true,
        netTotal: true,
        closedAt: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    });

    // distinct branches for dropdown (across all orders of this customer)
    const branchRefs = await prisma.order.findMany({
      where: { customerId: id },
      select: {
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
      distinct: ["branchId"],
    });

    const branchOptions = branchRefs
      .filter((b) => b.branchId && b.branch)
      .map((b) => ({
        id: b.branch!.id,
        name: b.branch!.name,
      }));

    const mappedOrders = orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      netTotal: decimalToNumber(o.netTotal),
      closedAt: o.closedAt,
      branch: o.branch?.name ?? null,
      branchId: o.branchId,
    }));

    res.json({
      name: customer.name,
      totalOrders,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalOrders / pageSize)),
      orders: mappedOrders,
      branches: branchOptions,
    });
  } catch (err) {
    console.error("GET /customers/:id/orders error:", err);
    res.status(500).json({ error: "Failed to load customer orders" });
  }
});

export default router;
