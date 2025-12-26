// apps/api/src/routes/pricing.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import { broadcastMenuUpdate } from "../ws";

const router = Router();

/* -------------------------- WS helper -------------------------- */
function notifyPricingChange(event: string, payload: any) {
  try {
    broadcastMenuUpdate({ event, payload });
  } catch (err) {
    console.error("broadcastMenuUpdate pricing error:", err);
  }
}

/* ============================= Tiers ============================= */

router.get("/tiers", requireAuth, async (_req, res) => {
  const tiers = await prisma.priceTier.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  res.json(tiers);
});

const TierCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1), // "NORMAL" / "JAHEZ" / "B2B" ...
  type: z.string().optional().nullable(), // "NORMAL" / "AGGREGATOR" / "B2B"
  isActive: z.boolean().optional(),
});

router.post("/tiers", requireAuth, async (req, res) => {
  const parsed = TierCreateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });

  const code = parsed.data.code.trim().toUpperCase();
  const name = parsed.data.name.trim();

  try {
    const tier = await prisma.priceTier.create({
      data: {
        name,
        code,
        type: parsed.data.type
          ? String(parsed.data.type).trim().toUpperCase()
          : null,
        isActive:
          typeof parsed.data.isActive === "boolean" ? parsed.data.isActive : true,
      },
    });

    notifyPricingChange("pricing-tier:created", tier);
    res.status(201).json(tier);
  } catch (e: any) {
    if (e?.code === "P2002")
      return res.status(409).json({ error: "Tier code already exists" });
    console.error("POST /pricing/tiers error:", e);
    res.status(500).json({ error: "Failed to create tier" });
  }
});

const TierUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  type: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.delete("/tiers/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    // hard-delete (simple). If you want soft delete, add isDeleted field.
    await prisma.priceTier.delete({ where: { id } });

    notifyPricingChange("pricing-tier:deleted", { id });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2025")
      return res.status(404).json({ error: "Tier not found" });
    console.error("DELETE /pricing/tiers/:id error:", e);
    res.status(500).json({ error: "Failed to delete tier" });
  }
});

/* ======================= Tier Overrides APIs ======================= */
/**
 * GET current overrides:
 *   GET /pricing/tiers/:tierId/overrides?productId=...
 * returns:
 *  { sizes: [{productSizeId, price}], modifierItems: [{modifierItemId, price}] }
 */
router.get("/tiers/:tierId/overrides", requireAuth, async (req, res) => {
  const { tierId } = req.params;
  const productId = req.query.productId ? String(req.query.productId) : null;

  const tier = await prisma.priceTier.findUnique({ where: { id: tierId } });
  if (!tier) return res.status(404).json({ error: "Tier not found" });

  let sizeIds: string[] | null = null;
  if (productId) {
    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sizes: { select: { id: true } } },
    });
    if (!p) return res.status(404).json({ error: "Product not found" });
    sizeIds = p.sizes.map((s) => s.id);
  }

  const [sizes, modifierItems] = await Promise.all([
    prisma.tierProductSizePrice.findMany({
      where: {
        tierId,
        ...(sizeIds ? { productSizeId: { in: sizeIds } } : {}),
      },
      select: { productSizeId: true, price: true },
    }),
    prisma.tierModifierItemPrice.findMany({
      where: { tierId },
      select: { modifierItemId: true, price: true },
    }),
  ]);

  res.json({
    sizes: sizes.map((x) => ({
      productSizeId: x.productSizeId,
      price: Number(x.price),
    })),
    modifierItems: modifierItems.map((x) => ({
      modifierItemId: x.modifierItemId,
      price: Number(x.price),
    })),
  });
});

/**
 * Save overrides:
 * PUT /pricing/tiers/:tierId/overrides
 * body:
 *  {
 *    sizes: [{ productSizeId, price|null }],        // null => delete override
 *    modifierItems: [{ modifierItemId, price|null }] // null => delete override
 *  }
 */
const SaveOverridesSchema = z.object({
  sizes: z
    .array(
      z.object({
        productSizeId: z.string().min(1),
        price: z.number().nonnegative().nullable(),
      })
    )
    .default([]),
  modifierItems: z
    .array(
      z.object({
        modifierItemId: z.string().min(1),
        price: z.number().nonnegative().nullable(),
      })
    )
    .default([]),
});

router.put("/tiers/:tierId/overrides", requireAuth, async (req, res) => {
  const { tierId } = req.params;

  const tier = await prisma.priceTier.findUnique({ where: { id: tierId } });
  if (!tier) return res.status(404).json({ error: "Tier not found" });

  const parsed = SaveOverridesSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });

  await prisma.$transaction(async (tx) => {
    for (const row of parsed.data.sizes) {
      const exists = await tx.productSize.findUnique({
        where: { id: row.productSizeId },
        select: { id: true },
      });
      if (!exists) continue;

      if (row.price == null) {
        await tx.tierProductSizePrice.deleteMany({
          where: { tierId, productSizeId: row.productSizeId },
        });
      } else {
        await tx.tierProductSizePrice.upsert({
          where: { tierId_productSizeId: { tierId, productSizeId: row.productSizeId } },
          create: { tierId, productSizeId: row.productSizeId, price: row.price },
          update: { price: row.price },
        });
      }
    }

    for (const row of parsed.data.modifierItems) {
      const exists = await tx.modifierItem.findUnique({
        where: { id: row.modifierItemId },
        select: { id: true },
      });
      if (!exists) continue;

      if (row.price == null) {
        await tx.tierModifierItemPrice.deleteMany({
          where: { tierId, modifierItemId: row.modifierItemId },
        });
      } else {
        await tx.tierModifierItemPrice.upsert({
          where: { tierId_modifierItemId: { tierId, modifierItemId: row.modifierItemId } },
          create: { tierId, modifierItemId: row.modifierItemId, price: row.price },
          update: { price: row.price },
        });
      }
    }
  });

  notifyPricingChange("pricing-overrides:updated", { tierId });
  res.json({ ok: true });
});

/* ============================================================
   ✅ Missing endpoint your POSAPP calls:
   POST /pricing/tier-pricing
   body: { tierId, productSizeIds[], modifierItemIds[] }
   returns: { sizesMap, modifierItemsMap }
   ============================================================ */

const TierPricingSchema = z.object({
  tierId: z.string().min(1),
  productSizeIds: z.array(z.string().min(1)).default([]),
  modifierItemIds: z.array(z.string().min(1)).default([]),
});

router.post("/tier-pricing", requireAuth, async (req, res) => {
  try {
    const parsed = TierPricingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const { tierId, productSizeIds, modifierItemIds } = parsed.data;

    const tier = await prisma.priceTier.findUnique({ where: { id: tierId } });
    if (!tier) return res.status(404).json({ error: "Tier not found" });

    const [sizeRows, modRows] = await Promise.all([
      productSizeIds.length
        ? prisma.tierProductSizePrice.findMany({
            where: { tierId, productSizeId: { in: productSizeIds } },
            select: { productSizeId: true, price: true },
          })
        : Promise.resolve([] as any[]),
      modifierItemIds.length
        ? prisma.tierModifierItemPrice.findMany({
            where: { tierId, modifierItemId: { in: modifierItemIds } },
            select: { modifierItemId: true, price: true },
          })
        : Promise.resolve([] as any[]),
    ]);

    const sizesMap: Record<string, number> = {};
    for (const r of sizeRows as any[]) sizesMap[r.productSizeId] = Number(r.price);

    const modifierItemsMap: Record<string, number> = {};
    for (const r of modRows as any[]) modifierItemsMap[r.modifierItemId] = Number(r.price);

    return res.json({
      tierId,
      sizesMap,
      modifierItemsMap,
    });
  } catch (e: any) {
    console.error("POST /pricing/tier-pricing error:", e);
    return res.status(500).json({ error: "tier_pricing_failed", message: e?.message || String(e) });
  }
});

export default router;
