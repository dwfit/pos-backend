// apps/api/src/routes/dash.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /dash/cards
 *
 * Optional query params:
 * - brandId  (if missing or "ALL" => all allowed brands)
 * - branchId
 * - dateFrom (YYYY-MM-DD, inclusive)
 * - dateTo   (YYYY-MM-DD, inclusive)
 */
router.get("/cards", requireAuth, async (req: any, res) => {
  try {
    const q = req.query as {
      dateFrom?: string;
      dateTo?: string;
      branchId?: string;
      brandId?: string;
    };

    // Normalize inputs (avoid "ALL " or "")
    const brandIdRaw = typeof q.brandId === "string" ? q.brandId.trim() : undefined;
    const brandId = brandIdRaw && brandIdRaw.length ? brandIdRaw : undefined;

    const branchIdRaw = typeof q.branchId === "string" ? q.branchId.trim() : undefined;
    const branchId = branchIdRaw && branchIdRaw.length ? branchIdRaw : undefined;

    const dateFrom = typeof q.dateFrom === "string" ? q.dateFrom.trim() : undefined;
    const dateTo = typeof q.dateTo === "string" ? q.dateTo.trim() : undefined;

    // ✅ Only count fully closed (paid) orders
    const where: any = {
      status: "CLOSED",
    };

    // ------------------------------------------------------------------
    // ✅ RBAC: brand access filter
    // req.user should have:
    // - allowAllBrands: boolean
    // - allowedBrandIds: string[]
    // ------------------------------------------------------------------
    const user = req.user;

    const wantsAllBrands = !brandId || brandId === "ALL";

    if (!user?.allowAllBrands) {
      const allowedIds: string[] = Array.isArray(user?.allowedBrandIds)
        ? user.allowedBrandIds
        : [];

      // If user has no allowed brands, return zeros safely
      if (!allowedIds.length) {
        return res.json({
          orders: 0,
          netSales: 0,
          netPayments: 0,
          discounts: 0,
          returns: 0,
          avgTicket: 0,
        });
      }

      if (wantsAllBrands) {
        where.brandId = { in: allowedIds };
      } else {
        // If they selected a brand they don't have access to -> return zeros
        if (!allowedIds.includes(brandId)) {
          return res.json({
            orders: 0,
            netSales: 0,
            netPayments: 0,
            discounts: 0,
            returns: 0,
            avgTicket: 0,
          });
        }
        where.brandId = brandId;
      }
    } else {
      // allowAllBrands === true
      if (!wantsAllBrands) {
        where.brandId = brandId;
      }
    }

    // ------------------------------------------------------------------
    // Existing filters
    // ------------------------------------------------------------------
    if (branchId && branchId !== "ALL") {
      where.branchId = branchId;
    }

    if (dateFrom || dateTo) {
      const start = dateFrom
        ? new Date(`${dateFrom}T00:00:00`)
        : new Date("1970-01-01T00:00:00");

      const end = dateTo
        ? new Date(`${dateTo}T23:59:59.999`)
        : new Date("2999-01-01T23:59:59.999");

      where.businessDate = { gte: start, lte: end };
    }

    // ------------------------------------------------------------------
    // KPI aggregation (fast): count + sum
    // ------------------------------------------------------------------
    const agg = await prisma.order.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        netTotal: true,
        discountTotal: true,
      },
    });

    const orders = agg._count?._all ?? 0;
    const netSales = Number(agg._sum?.netTotal ?? 0);
    const discounts = Number(agg._sum?.discountTotal ?? 0);

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
