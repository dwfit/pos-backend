// apps/api/src/routes/pos-settings.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router = Router();

/* ------------- helpers ------------- */

/**
 * Generate the next reference like:
 *  - sch-001, sch-002, ...
 *  - agg-001, agg-002, ...
 */
async function nextReference(
  prefix: string,
  table: "scheduler" | "aggregator"
) {
  const model =
    table === "scheduler" ? prisma.posScheduler : prisma.posAggregator;

  const last = await model.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let num = 1;
  if (last?.reference) {
    const parts = last.reference.split("-");
    const lastNum = Number(parts[parts.length - 1]);
    if (!isNaN(lastNum)) num = lastNum + 1;
  }

  return `${prefix}-${String(num).padStart(3, "0")}`;
}

/* ================== SCHEDULERS ================== */

const schedulerBody = z.object({
  name: z.string().min(1, "Name is required"),
  // allow missing / empty string so we can auto-generate
  reference: z
    .string()
    .optional()
    .transform((v) => (v == null ? "" : v)),
  // coerce "30" → 30
  intervalMinutes: z.coerce.number().int().positive(),
  isActive: z.boolean().optional().default(true),
});

/**
 * GET /pos-settings/schedulers
 * Optional query: ?includeDeleted=1 to also return soft-deleted rows.
 */
router.get("/schedulers", requireAuth, async (req, res, next) => {
  try {
    const { includeDeleted } = req.query as { includeDeleted?: string };
    const where = includeDeleted === "1" ? {} : { isDeleted: false };

    const rows = await prisma.posScheduler.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /pos-settings/schedulers
 * Body: { name, reference?, intervalMinutes, isActive? }
 * - reference auto-generated if empty.
 */
router.post("/schedulers", requireAuth, async (req: any, res, next) => {
  try {
    let { name, reference, intervalMinutes, isActive } = schedulerBody.parse(
      req.body
    );

    // auto-generate reference if empty / whitespace
    if (!reference?.trim()) {
      reference = await nextReference("sch", "scheduler");
    }

    const created = await prisma.posScheduler.create({
      data: {
        name,
        reference,
        intervalMinutes,
        isActive,
        createdById: req.user?.id ?? null,
        updatedById: req.user?.id ?? null,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /pos-settings/schedulers/:id
 * Body: { name, reference, intervalMinutes, isActive }
 */
router.put("/schedulers/:id", requireAuth, async (req: any, res, next) => {
  try {
    const id = String(req.params.id);
    const { name, reference, intervalMinutes, isActive } = schedulerBody.parse(
      req.body
    );

    const updated = await prisma.posScheduler.update({
      where: { id },
      data: {
        name,
        reference,
        intervalMinutes,
        isActive,
        updatedById: req.user?.id ?? null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /pos-settings/schedulers/:id
 * Soft delete: sets isDeleted=true, isActive=false
 */
router.delete("/schedulers/:id", requireAuth, async (req: any, res, next) => {
  try {
    const id = String(req.params.id);

    const updated = await prisma.posScheduler.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedById: req.user?.id ?? null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /pos-settings/schedulers/:id/restore
 * Undo soft delete: sets isDeleted=false, isActive=true
 */
router.post(
  "/schedulers/:id/restore",
  requireAuth,
  async (req: any, res, next) => {
    try {
      const id = String(req.params.id);

      const updated = await prisma.posScheduler.update({
        where: { id },
        data: {
          isDeleted: false,
          isActive: true,
          updatedById: req.user?.id ?? null,
        },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/* ================== AGGREGATORS ================== */

const aggregatorBody = z.object({
  name: z.string().min(1, "Name is required"),
  // allow missing / empty string so we can auto-generate
  reference: z
    .string()
    .optional()
    .transform((v) => (v == null ? "" : v)),
  isActive: z.boolean().optional().default(true),
});

/**
 * GET /pos-settings/aggregators
 * Optional query: ?includeDeleted=1 to also return soft-deleted rows.
 */
router.get("/aggregators", requireAuth, async (req, res, next) => {
  try {
    const { includeDeleted } = req.query as { includeDeleted?: string };
    const where = includeDeleted === "1" ? {} : { isDeleted: false };

    const rows = await prisma.posAggregator.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /pos-settings/aggregators
 * Body: { name, reference?, isActive? }
 * - reference auto-generated if empty.
 */
router.post("/aggregators", requireAuth, async (req: any, res, next) => {
  try {
    let { name, reference, isActive } = aggregatorBody.parse(req.body);

    if (!reference?.trim()) {
      reference = await nextReference("agg", "aggregator");
    }

    const created = await prisma.posAggregator.create({
      data: {
        name,
        reference,
        isActive,
        createdById: req.user?.id ?? null,
        updatedById: req.user?.id ?? null,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /pos-settings/aggregators/:id
 * Body: { name, reference, isActive }
 */
router.put("/aggregators/:id", requireAuth, async (req: any, res, next) => {
  try {
    const id = String(req.params.id);
    const { name, reference, isActive } = aggregatorBody.parse(req.body);

    const updated = await prisma.posAggregator.update({
      where: { id },
      data: {
        name,
        reference,
        isActive,
        updatedById: req.user?.id ?? null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /pos-settings/aggregators/:id
 * Soft delete: sets isDeleted=true, isActive=false
 */
router.delete("/aggregators/:id", requireAuth, async (req: any, res, next) => {
  try {
    const id = String(req.params.id);

    const updated = await prisma.posAggregator.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        updatedById: req.user?.id ?? null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /pos-settings/aggregators/:id/restore
 * Undo soft delete: sets isDeleted=false, isActive=true
 */
router.post(
  "/aggregators/:id/restore",
  requireAuth,
  async (req: any, res, next) => {
    try {
      const id = String(req.params.id);

      const updated = await prisma.posAggregator.update({
        where: { id },
        data: {
          isDeleted: false,
          isActive: true,
          updatedById: req.user?.id ?? null,
        },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
