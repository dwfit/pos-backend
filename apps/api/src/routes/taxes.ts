// apps/api/src/routes/taxes.ts
import { Router } from "express";
import { prisma } from "../db";
import { Prisma } from "@prisma/client";

const router = Router();

/* ---------- Taxes ---------- */
/**
 * GET /settings/taxes
 * Returns active taxes only.
 */
router.get("/taxes", async (_req, res) => {
  try {
    const taxes = await prisma.tax.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
    });

    // Normalize Decimal to number for FE
    res.json(
      taxes.map((t) => ({
        id: t.id,
        name: t.name,
        rate: Number(t.rate), // safe conversion for display
        isActive: t.isActive,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    );
  } catch (e: any) {
    console.error("GET /settings/taxes error:", e);
    res.status(500).json({ error: "Failed to load taxes" });
  }
});

/**
 * POST /settings/taxes
 * Body: { name: string; rate: number }
 * rate in percent (e.g. 15 for 15%)
 */
router.post("/taxes", async (req, res) => {
  try {
    const { name, rate }: { name?: string; rate?: number } = req.body ?? {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name (string) is required" });
    }
    if (typeof rate !== "number" || Number.isNaN(rate)) {
      return res.status(400).json({ error: "rate (number) is required" });
    }
    if (rate < 0 || rate > 100) {
      return res.status(400).json({ error: "rate must be between 0 and 100" });
    }

    const created = await prisma.tax.create({
      data: {
        name: name.trim(),
        // store as Decimal in DB (percent)
        rate: new Prisma.Decimal(rate),
        isActive: true,
      },
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      rate: Number(created.rate),
      isActive: created.isActive,
    });
  } catch (e: any) {
    // Prisma unique/validation issues
    if (e?.code === "P2002") {
      return res
        .status(409)
        .json({ error: "A tax with this name already exists" });
    }
    console.error("POST /settings/taxes error:", e);
    res.status(500).json({ error: "Failed to save tax" });
  }
});

/* ---------- Tax Groups ---------- */
/**
 * GET /settings/tax-groups
 */
router.get("/tax-groups", async (_req, res) => {
  try {
    const groups = await prisma.taxGroup.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
      include: { items: { include: { tax: true } } },
    });

    res.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        taxes: g.items.map((i) => ({
          id: i.tax.id,
          name: i.tax.name,
          rate: Number(i.tax.rate),
        })),
      }))
    );
  } catch (e: any) {
    console.error("GET /settings/tax-groups error:", e);
    res.status(500).json({ error: "Failed to load tax groups" });
  }
});

/**
 * POST /settings/tax-groups
 * Body: { name: string; taxIds: number[] }
 */
router.post("/tax-groups", async (req, res) => {
  try {
    const { name, taxIds }: { name?: string; taxIds?: number[] } =
      req.body ?? {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name (string) is required" });
    }
    if (!Array.isArray(taxIds) || taxIds.length === 0) {
      return res
        .status(400)
        .json({ error: "taxIds (non-empty number[]) are required" });
    }

    const created = await prisma.taxGroup.create({
      data: {
        name: name.trim(),
        isActive: true,
        items: {
          create: taxIds.map((id) => ({
            tax: { connect: { id } },
          })),
        },
      },
      include: { items: { include: { tax: true } } },
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      taxes: created.items.map((i) => ({
        id: i.tax.id,
        name: i.tax.name,
        rate: Number(i.tax.rate),
      })),
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return res
        .status(409)
        .json({ error: "A tax group with this name already exists" });
    }
    console.error("POST /settings/tax-groups error:", e);
    res.status(500).json({ error: "Failed to save tax group" });
  }
});

export default router;
