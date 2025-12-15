// apps/api/src/routes/dash.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /dash/cards
 * Returns KPI cards:
 * - orders         (count of CLOSED orders)
 * - netSales       (sum of netTotal)
 * - netPayments    (same as netSales for now)
 * - discounts      (sum of discountTotal)
 * - returns        (placeholder: 0)
 * - avgTicket      (netSales / orders)
 *
 * Optional query params:
 * - branchId
 * - dateFrom (YYYY-MM-DD, inclusive)
 * - dateTo   (YYYY-MM-DD, inclusive)
 */
router.get("/cards", requireAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, branchId } = req.query as {
      dateFrom?: string;
      dateTo?: string;
      branchId?: string;
    };

    // Only count fully closed (paid) orders
    const where: any = {
      status: "CLOSED",
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (dateFrom || dateTo) {
      const start = dateFrom
        ? new Date(`${dateFrom}T00:00:00`)
        : new Date("1970-01-01T00:00:00");

      const end = dateTo
        ? new Date(`${dateTo}T23:59:59.999`)
        : new Date("2999-01-01T23:59:59.999");

      where.businessDate = {
        gte: start,
        lte: end,
      };
    }

    const rows = await prisma.order.findMany({
      where,
      select: {
        id: true,
        netTotal: true,
        discountTotal: true,
      },
    });

    const orders = rows.length;

    const netSales = rows.reduce(
      (sum, r) => sum + Number(r.netTotal ?? 0),
      0
    );

    const discounts = rows.reduce(
      (sum, r) => sum + Number(r.discountTotal ?? 0),
      0
    );

    const netPayments = netSales; // for now same as netSales
    const returns = 0; // placeholder until you add returns logic

    const avgTicket = orders ? netSales / orders : 0;

    return res.json({
      orders,
      netSales,
      netPayments,
      discounts,
      returns,
      avgTicket,
    });
  } catch (err) {
    console.error("GET /dash/cards ERROR", err);
    return res.status(500).json({
      error: "internal_error",
      details: String(err),
    });
  }
});

export default router;
