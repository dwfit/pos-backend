// apps/api/src/routes/discounts.ts
import { Router } from 'express';
import { prisma } from '../db';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

const router = Router();

/* --------------------------- helpers & schemas --------------------------- */

// Dine in / pickup / etc. – we store them as CSV in Discount.orderTypes
const OrderTypeEnum = z.enum(['DINE_IN', 'PICKUP', 'DELIVERY', 'DRIVE_THRU']);

const createDiscountSchema = z.object({
  name: z.string().min(1),
  nameLocalized: z.string().optional(),
  qualification: z.enum(['PRODUCT', 'ORDER', 'ORDER_AND_PRODUCT']),
  type: z.enum(['FIXED', 'PERCENTAGE']),
  value: z.number().nonnegative(),

  maxDiscount: z.number().nonnegative().optional(),
  minProductPrice: z.number().nonnegative().optional(),
  orderTypes: z.array(OrderTypeEnum).optional(),

  taxable: z.boolean().optional().default(false),
});

const updateDiscountSchema = createDiscountSchema.partial().extend({
  // name, qualification, etc. are *optional* for update
  name: z.string().min(1).optional(),
  qualification: z.enum(['PRODUCT', 'ORDER', 'ORDER_AND_PRODUCT']).optional(),
  type: z.enum(['FIXED', 'PERCENTAGE']).optional(),
  value: z.number().nonnegative().optional(),
});

/**
 * Targets schema
 * - New: productSizeIds (preferred, size IDs)
 * - Legacy: productIds (product IDs) for backward compatibility
 */
const updateTargetsSchema = z.object({
  applyAllBranches: z.boolean().optional(),
  branchIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
  productSizeIds: z.array(z.string()).optional(), // ⭐ size IDs from frontend
  productIds: z.array(z.string()).optional(), // ⭐ legacy support
});

/**
 * Generate next reference like Disc-001, Disc-002 ...
 */
async function generateReference(): Promise<string> {
  const last = await prisma.discount.findFirst({
    where: { reference: { startsWith: 'Disc-' } },
    orderBy: { reference: 'desc' },
  });

  let nextNum = 1;
  if (last?.reference) {
    const m = last.reference.match(/^Disc-(\d+)$/i);
    if (m) nextNum = Number(m[1]) + 1;
  }

  return `Disc-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Normalize discount + relations into the JSON shape the frontend expects.
 * NOTE: we now expose productSizeIds (and also productIds for safety).
 */
function formatDiscountResponse(d: any) {
  if (!d) return null;

  return {
    id: d.id,
    name: d.name,
    nameLocalized: d.nameLocalized,
    qualification: d.qualification,
    type: d.type,
    value: d.value,
    reference: d.reference,
    taxable: d.taxable,
    maxDiscount: d.maxDiscount,
    minProductPrice: d.minProductPrice,
    orderTypes: d.orderTypes, // CSV string (e.g. "DINE_IN,PICKUP")
    applyAllBranches: d.applyAllBranches ?? false,

    // arrays of ids for UI hydration
    branchIds: Array.isArray(d.branches)
      ? d.branches.map((b: any) => b.branchId)
      : [],
    categoryIds: Array.isArray(d.categories)
      ? d.categories.map((c: any) => c.categoryId)
      : [],

    // 🔹 use `productSizes` relation (Discount.productSizes)
    productSizeIds: Array.isArray(d.productSizes)
      ? d.productSizes.map((p: any) => p.productSizeId)
      : [],
    productIds: Array.isArray(d.productSizes)
      ? d.productSizes
          .map((p: any) => p.productId)
          .filter((pid: any) => !!pid)
      : [],
  };
}

/* --------------------------- routes ---------------------------- */

// GET /discounts – list (non-deleted)
router.get('/', requireAuth, async (_req, res) => {
  try {
    const discounts = await prisma.discount.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    // list page doesn't need branchIds etc, so raw is fine
    res.json(discounts);
  } catch (err) {
    console.error('GET /discounts error', err);
    res.status(500).json({ message: 'Failed to load discounts' });
  }
});

// GET /discounts/:id – detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const discount = await prisma.discount.findUnique({
      where: { id },
      include: {
        branches: {
          select: {
            branchId: true,
          },
        },
        categories: {
          select: {
            categoryId: true,
          },
        },
        // ✅ use `productSizes` relation instead of `products`
        productSizes: {
          select: {
            productSizeId: true,
            productId: true,
          },
        },
        // orderTypes is scalar CSV string, so no include needed
      },
    });

    if (!discount) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    // ✅ return normalized shape with branchIds / categoryIds / productSizeIds
    const payload = formatDiscountResponse(discount);
    res.json(payload);
  } catch (err) {
    console.error('GET /discounts/:id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /discounts – create new
router.post('/', requireAuth, async (req, res) => {
  try {
    console.log('📥 POST /discounts body:', req.body);

    const parsed = createDiscountSchema.parse(req.body);

    const reference = await generateReference();

    const discount = await prisma.discount.create({
      data: {
        name: parsed.name,
        nameLocalized: parsed.nameLocalized,
        qualification: parsed.qualification,
        type: parsed.type,
        value: parsed.value,
        taxable: parsed.taxable ?? false,
        reference,

        maxDiscount: parsed.maxDiscount ?? null,
        minProductPrice: parsed.minProductPrice ?? null,
        orderTypes: parsed.orderTypes ? parsed.orderTypes.join(',') : null,
      },
    });

    res.status(201).json(discount);
  } catch (err: any) {
    console.error('POST /discounts error', err);

    if (err.name === 'ZodError') {
      return res.status(400).json({
        message: 'Invalid data',
        issues: err.issues,
      });
    }

    res.status(500).json({
      message: err?.message || 'Failed to create discount',
    });
  }
});

// PUT /discounts/:id – update basic fields (Edit Discount modal)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📝 PUT /discounts/:id body:', req.body);

    const parsed = updateDiscountSchema.parse(req.body);

    // Build data object only with provided fields
    const data: any = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.nameLocalized !== undefined)
      data.nameLocalized = parsed.nameLocalized;
    if (parsed.qualification !== undefined)
      data.qualification = parsed.qualification;
    if (parsed.type !== undefined) data.type = parsed.type;
    if (parsed.value !== undefined) data.value = parsed.value;
    if (parsed.taxable !== undefined) data.taxable = parsed.taxable;
    if (parsed.maxDiscount !== undefined) data.maxDiscount = parsed.maxDiscount;
    if (parsed.minProductPrice !== undefined)
      data.minProductPrice = parsed.minProductPrice;
    if (parsed.orderTypes !== undefined)
      data.orderTypes = parsed.orderTypes ? parsed.orderTypes.join(',') : null;

    const updated = await prisma.discount.update({
      where: { id },
      data,
    });

    // For edit modal we only need basic fields, so raw is okay
    res.json(updated);
  } catch (err: any) {
    console.error('PUT /discounts/:id error', err);

    if (err.name === 'ZodError') {
      return res.status(400).json({
        message: 'Invalid data',
        issues: err.issues,
      });
    }

    res.status(500).json({
      message: err?.message || 'Failed to update discount',
    });
  }
});

// PUT /discounts/:id/targets – branches / categories / product sizes mapping
router.put('/:id/targets', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎯 PUT /discounts/:id/targets body:', req.body);

    const parsed = updateTargetsSchema.parse(req.body);

    await prisma.$transaction(async tx => {
      /* ---------------- applyAllBranches flag on Discount --------------- */
      if (parsed.applyAllBranches !== undefined) {
        await tx.discount.update({
          where: { id },
          data: { applyAllBranches: parsed.applyAllBranches },
        });
      }

      /* --------------------------- BRANCH LINKS -------------------------- */
      if (parsed.branchIds || parsed.applyAllBranches !== undefined) {
        // always clear existing links first
        await tx.discountBranch.deleteMany({ where: { discountId: id } });

        if (parsed.applyAllBranches) {
          // GLOBAL – link to *all* existing branches
          const allBranches = await tx.branch.findMany({
            select: { id: true },
          });

          if (allBranches.length) {
            await tx.discountBranch.createMany({
              data: allBranches.map(b => ({
                discountId: id,
                branchId: b.id,
              })),
              skipDuplicates: true,
            });
          }
        } else if (parsed.branchIds && parsed.branchIds.length) {
          // MANUAL – link only selected branches
          await tx.discountBranch.createMany({
            data: parsed.branchIds.map(branchId => ({
              discountId: id,
              branchId,
            })),
            skipDuplicates: true,
          });
        }
      }

      /* ------------------------- CATEGORY LINKS -------------------------- */
      if (parsed.categoryIds) {
        await tx.discountCategory.deleteMany({ where: { discountId: id } });
        if (parsed.categoryIds.length) {
          await tx.discountCategory.createMany({
            data: parsed.categoryIds.map(categoryId => ({
              discountId: id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }

      /* -------------------- PRODUCT SIZE / PRODUCT LINKS ----------------- */

      // We support both:
      // - productSizeIds (preferred, direct size IDs)
      // - productIds (legacy, map to sizes)
      const hasSizeIds =
        Array.isArray(parsed.productSizeIds) &&
        parsed.productSizeIds.length > 0;
      const hasProductIds =
        Array.isArray(parsed.productIds) && parsed.productIds.length > 0;

      // Always clear existing links if either key is present
      if (hasSizeIds || hasProductIds || parsed.productSizeIds) {
        // 🔴 IMPORTANT: use your real join model here.
        // If your Prisma model is `DiscountProductSize`, the client is `discountProductSize`.
        await tx.discountProductSize.deleteMany({ where: { discountId: id } });

        let rows: {
          discountId: string;
          productSizeId: string;
          productId?: string | null;
        }[] = [];

        if (hasSizeIds) {
          // Direct size IDs from frontend
          const sizes = await tx.productSize.findMany({
            where: { id: { in: parsed.productSizeIds! } },
            select: { id: true, productId: true },
          });

          rows = sizes.map(s => ({
            discountId: id,
            productSizeId: s.id,
            productId: s.productId ?? null,
          }));
        } else if (hasProductIds) {
          // Legacy: map productIds -> their sizes
          const sizes = await tx.productSize.findMany({
            where: { productId: { in: parsed.productIds! } },
            select: { id: true, productId: true },
          });

          rows = sizes.map(s => ({
            discountId: id,
            productSizeId: s.id,
            productId: s.productId ?? null,
          }));
        }

        if (rows.length) {
          await tx.discountProductSize.createMany({
            data: rows,
            skipDuplicates: true,
          });
        }
      }
    });

    // return the updated discount + target id arrays
    const fresh = await prisma.discount.findUnique({
      where: { id },
      include: {
        branches: { select: { branchId: true } },
        categories: { select: { categoryId: true } },
        // ✅ again: use productSizes relation
        productSizes: { select: { productSizeId: true, productId: true } },
      },
    });

    if (!fresh) {
      return res.status(404).json({ message: 'Discount not found' });
    }

    // ✅ normalized response so frontend can hydrate selected IDs
    res.json(formatDiscountResponse(fresh));
  } catch (err: any) {
    console.error('PUT /discounts/:id/targets error', err);

    if (err.name === 'ZodError') {
      return res.status(400).json({
        message: 'Invalid data',
        issues: err.issues,
      });
    }

    res.status(500).json({
      message: err?.message || 'Failed to update discount targets',
    });
  }
});

// DELETE /discounts/:id – soft delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await prisma.discount.update({
      where: { id },
      data: { isDeleted: true },
    });

    res.json(deleted);
  } catch (err: any) {
    console.error('DELETE /discounts/:id error', err);
    res.status(500).json({
      message: err?.message || 'Failed to delete discount',
    });
  }
});

export default router;
