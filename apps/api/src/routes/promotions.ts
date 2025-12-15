// apps/api/src/routes/promotions.ts
import { Router } from 'express';
import { prisma } from '../db';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

const router = Router();

const OrderTypeEnum = z.enum(['DINE_IN', 'PICKUP', 'DELIVERY', 'DRIVE_THRU']);
const WeekdayEnum = z.enum(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);

const baseBody = z.object({
  name: z.string().min(1),
  nameLocalized: z.string().optional().nullable(),
  // description: z.string().optional().nullable(), // enable if you add column
  isActive: z.boolean().optional().default(true),

  startDate: z.string(), // ISO date
  endDate: z.string(),
  startTime: z.string(), // "07:00"
  endTime: z.string(), // "23:59"

  days: z.array(WeekdayEnum).min(1),
  orderTypes: z.array(OrderTypeEnum).min(1),

  priority: z.number().int().optional().nullable(),
  includeModifiers: z.boolean().optional().default(false),

  promotionType: z.enum(['BASIC', 'ADVANCED']).default('BASIC'),

  // BASIC
  basicDiscountType: z.enum(['VALUE', 'PERCENT']).optional().nullable(),
  basicDiscountValue: z.number().nonnegative().optional().nullable(),

  // ADVANCED
  conditionKind: z.enum(['BUYS_QUANTITY', 'SPENDS_AMOUNT']).optional().nullable(),
  conditionQty: z.number().int().nonnegative().optional().nullable(),
  conditionSpend: z.number().nonnegative().optional().nullable(),
  rewardKind: z
    .enum(['DISCOUNT_ON_ORDER', 'DISCOUNT_ON_PRODUCT', 'PAY_FIXED_AMOUNT'])
    .optional()
    .nullable(),
  rewardDiscountType: z.enum(['VALUE', 'PERCENT']).optional().nullable(),
  rewardDiscountValue: z.number().nonnegative().optional().nullable(),
  rewardFixedAmount: z.number().nonnegative().optional().nullable(),

  branchIds: z.array(z.string()).min(1),
  productSizeIds: z.array(z.string()).optional().default([]), // always size
  customerTagIds: z.array(z.string()).optional().default([]),
});

const createBody = baseBody;
const updateBody = baseBody.partial().extend({ id: z.string().optional() });

function timeStrToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToTimeStr(totalMins: number | null | undefined): string | null {
  if (totalMins == null || Number.isNaN(totalMins)) return null;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function computeStatus(p: { isActive: boolean; startDate: Date; endDate: Date }) {
  if (!p.isActive) return 'INACTIVE';
  const now = new Date();
  if (p.endDate < now) return 'EXPIRED';
  if (p.startDate > now) return 'SCHEDULED';
  return 'ACTIVE';
}

/* -------------------------- LIST (for kanban) -------------------------- */

router.get('/', requireAuth, async (req, res) => {
  const take = Number(req.query.take ?? 20);
  const skip = Number(req.query.skip ?? 0);

  const [items, total] = await Promise.all([
    prisma.promotion.findMany({
      orderBy: { createdAt: 'asc' }, // or 'desc' as you like
      take,
      skip,
      include: {
        branches: { include: { branch: true } },
      },
    }),
    prisma.promotion.count(),
  ]);

  const result = items.map((p) => ({
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    startDate: p.startDate,
    endDate: p.endDate,
    priority: p.priority,
    status: computeStatus(p),
    branches: p.branches.map((b) => b.branch.name),
  }));

  res.json({ items: result, total, take, skip });
});

/* ------------------------------ GET by id ------------------------------ */

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const promotion = await prisma.promotion.findUnique({
    where: { id },
    include: {
      branches: true,
      products: {
        include: {
          // adjust relation names if needed:
          productSize: {
            include: {
              product: true,
            },
          },
        },
      }, // PromotionProduct[]
      promotionCustomerTags: true,
    },
  });

  if (!promotion) return res.status(404).json({ message: 'Not found' });

  const dto = {
    id: promotion.id,
    name: promotion.name,
    nameLocalized: promotion.nameLocalized,
    // description: promotion.description,
    isActive: promotion.isActive,
    status: computeStatus({
      isActive: promotion.isActive,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
    }),
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    startTime: minsToTimeStr(promotion.startTimeMins),
    endTime: minsToTimeStr(promotion.endTimeMins),
    days: promotion.daysCsv.split(',').filter(Boolean),
    orderTypes: promotion.orderTypesCsv.split(',').filter(Boolean),
    priority: promotion.priority,
    includeModifiers: promotion.includeModifiers,
    promotionType: promotion.promotionType,
    basicDiscountType: promotion.basicDiscountType,
    basicDiscountValue: promotion.basicDiscountValue,
    conditionKind: promotion.conditionKind,
    conditionQty: promotion.conditionQty,
    conditionSpend: promotion.conditionSpend,
    rewardKind: promotion.rewardKind,
    rewardDiscountType: promotion.rewardDiscountType,
    rewardDiscountValue: promotion.rewardDiscountValue,
    rewardFixedAmount: promotion.rewardFixedAmount,

    branchIds: promotion.branches.map((b) => b.branchId),

    // IDs for the form
    productSizeIds: promotion.products.map((p) => p.productSizeId),

    // Rich info for UI chips / labels
    productSizes: promotion.products.map((p) => ({
      id: p.productSizeId,
      productName: p.productSize?.product?.name ?? '',
      sizeName: p.productSize?.name ?? '',
      name:
        (p.productSize?.product?.name || p.productSize?.name)
          ? `${p.productSize?.product?.name ?? ''} ${p.productSize?.name ?? ''}`.trim()
          : '',
    })),

    customerTagIds: promotion.promotionCustomerTags.map((c) => c.tagId),
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
  };

  res.json(dto);
});

/* -------------------------------- CREATE -------------------------------- */

router.post('/', requireAuth, async (req, res) => {
  try {
    console.log('📩 POST /promotions body:', JSON.stringify(req.body, null, 2));

    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      console.error('❌ POST /promotions validation error:', flat);
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: flat,
      });
    }

    const data = parsed.data;

    const created = await prisma.promotion.create({
      data: {
        name: data.name,
        nameLocalized: data.nameLocalized ?? null,
        // description: data.description ?? null,
        isActive: data.isActive,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        startTimeMins: timeStrToMins(data.startTime),
        endTimeMins: timeStrToMins(data.endTime),
        daysCsv: data.days.join(','),
        orderTypesCsv: data.orderTypes.join(','),
        priority: data.priority ?? null,
        includeModifiers: data.includeModifiers,

        promotionType: data.promotionType,

        basicDiscountType: data.basicDiscountType ?? null,
        basicDiscountValue: data.basicDiscountValue ?? null,

        conditionKind: data.conditionKind ?? null,
        conditionQty: data.conditionQty ?? null,
        conditionSpend: data.conditionSpend ?? null,
        rewardKind: data.rewardKind ?? null,
        rewardDiscountType: data.rewardDiscountType ?? null,
        rewardDiscountValue: data.rewardDiscountValue ?? null,
        rewardFixedAmount: data.rewardFixedAmount ?? null,

        // link tables
        branches: {
          createMany: {
            data: data.branchIds.map((branchId) => ({ branchId })),
          },
        },
        products: data.productSizeIds.length
          ? {
              createMany: {
                data: data.productSizeIds.map((productSizeId) => ({
                  productSizeId,
                })),
              },
            }
          : undefined,
        promotionCustomerTags: data.customerTagIds.length
          ? {
              createMany: {
                data: data.customerTagIds.map((tagId) => ({ tagId })),
              },
            }
          : undefined,
      },
    });

    res.status(201).json(created);
  } catch (err: any) {
    console.error('❌ POST /promotions create error:', err);
    res.status(500).json({
      error: 'CREATE_PROMOTION_FAILED',
      message: err?.message ?? 'Unknown error',
    });
  }
});

/* -------------------------------- UPDATE -------------------------------- */

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    console.log('✏️ PUT /promotions/:id body:', JSON.stringify(req.body, null, 2));

    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      console.error('❌ PUT /promotions validation error:', flat);
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: flat,
      });
    }
    const data = parsed.data;

    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.update({
        where: { id },
        data: {
          name: data.name ?? existing.name,
          nameLocalized: data.nameLocalized ?? existing.nameLocalized,
          // description: data.description ?? existing.description, // if column exists
          isActive: data.isActive ?? existing.isActive,
          startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
          endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
          startTimeMins: data.startTime
            ? timeStrToMins(data.startTime)
            : existing.startTimeMins,
          endTimeMins: data.endTime
            ? timeStrToMins(data.endTime)
            : existing.endTimeMins,
          daysCsv: data.days ? data.days.join(',') : existing.daysCsv,
          orderTypesCsv: data.orderTypes
            ? data.orderTypes.join(',')
            : existing.orderTypesCsv,
          priority: data.priority ?? existing.priority,
          includeModifiers: data.includeModifiers ?? existing.includeModifiers,

          promotionType: data.promotionType ?? existing.promotionType,

          basicDiscountType: data.basicDiscountType ?? existing.basicDiscountType,
          basicDiscountValue: data.basicDiscountValue ?? existing.basicDiscountValue,

          conditionKind: data.conditionKind ?? existing.conditionKind,
          conditionQty: data.conditionQty ?? existing.conditionQty,
          conditionSpend: data.conditionSpend ?? existing.conditionSpend,
          rewardKind: data.rewardKind ?? existing.rewardKind,
          rewardDiscountType: data.rewardDiscountType ?? existing.rewardDiscountType,
          rewardDiscountValue:
            data.rewardDiscountValue ?? existing.rewardDiscountValue,
          rewardFixedAmount: data.rewardFixedAmount ?? existing.rewardFixedAmount,
        },
      });

      if (data.branchIds) {
        await tx.promotionBranch.deleteMany({ where: { promotionId: id } });
        if (data.branchIds.length) {
          await tx.promotionBranch.createMany({
            data: data.branchIds.map((branchId) => ({
              promotionId: id,
              branchId,
            })),
          });
        }
      }

      if (data.productSizeIds) {
        await tx.promotionProduct.deleteMany({ where: { promotionId: id } });
        if (data.productSizeIds.length) {
          await tx.promotionProduct.createMany({
            data: data.productSizeIds.map((productSizeId) => ({
              promotionId: id,
              productSizeId,
            })),
          });
        }
      }

      if (data.customerTagIds) {
        await tx.promotionCustomerTag.deleteMany({ where: { promotionId: id } });
        if (data.customerTagIds.length) {
          await tx.promotionCustomerTag.createMany({
            data: data.customerTagIds.map((tagId) => ({
              promotionId: id,
              tagId,
            })),
          });
        }
      }

      return promo;
    });

    res.json(updated);
  } catch (err: any) {
    console.error('❌ PUT /promotions/:id update error:', err);
    res.status(500).json({
      error: 'UPDATE_PROMOTION_FAILED',
      message: err?.message ?? 'Unknown error',
    });
  }
});

/* -------------------------- LOOKUPS FOR UI -------------------------- */

/** Product sizes for selector – /promotions/product-sizes */
router.get('/product-sizes', requireAuth, async (req, res) => {
  const sizes = await prisma.productSize.findMany({
    include: {
      product: true, // assumes relation ProductSize.product
    },
    orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
  });

  const result = sizes.map((s) => ({
    id: s.id,
    productName: s.product?.name ?? '',
    sizeName: s.name,
    name: s.name,
  }));

  res.json(result);
});

/** Branches for selector – /promotions/branches */
router.get('/branches', requireAuth, async (req, res) => {
  const branches = await prisma.branch.findMany({
    // where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  const result = branches.map((b) => ({
    id: b.id,
    name: b.name,
    code: (b as any).code ?? null, // keep if you have code column
  }));

  res.json(result);
});

export default router;
