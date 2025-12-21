// apps/api/src/routes/pos-config.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { DiscountType, Prisma } from '@prisma/client';

const router = Router();

/* ------------------------------------------------------------------ */
/* Types – to future-proof for auth (req.user)                        */
/* ------------------------------------------------------------------ */

type AuthedRequest = Request & {
  user?: {
    id: string;
    role?: string | null;
    permissions?: string[] | null;
  };
};

/* ------------------------------------------------------------------ */
/* VAT helper – always read from tax table                            */
/* ------------------------------------------------------------------ */

/**
 * Returns VAT as PERCENT (e.g. 15) for the POS app.
 * Supports tax.rate stored as 15 or 0.15.
 */
export async function getVatPercentFromDb(): Promise<number> {
  const tax = await prisma.tax.findFirst({
    orderBy: { id: 'asc' },
    select: { rate: true },
  });

  if (!tax) return 15;

  const raw = Number(tax.rate);
  if (!Number.isFinite(raw)) return 15;

  return raw < 1 ? raw * 100 : raw;
}

/* ------------------------------------------------------------------ */
/* GET /pos/config – VAT + Payment Methods + Schedulers + Aggregators */
/* + Predefined discounts for POS (filtered by branch assignments)    */
/* + Role-based discount permissions                                  */
/* ------------------------------------------------------------------ */

router.get('/config', async (req: AuthedRequest, res: Response) => {
  try {
    const vatRate = await getVatPercentFromDb(); // percent, e.g. 15

    // 🔐 Permissions from auth middleware (may be missing for POS)
    const rawPerms = Array.isArray(req.user?.permissions)
      ? (req.user!.permissions as string[])
      : [];
    const hasServerPermissions = rawPerms.length > 0;

    console.log('👤 POS config – user permissions:', rawPerms);

    const canApplyOpenDiscount = hasServerPermissions
      ? rawPerms.includes('pos.discounts.open.apply') ||
        rawPerms.includes('pos.discount.open.apply') ||
        rawPerms.includes('APPLY_OPEN_DISCOUNTS')
      : true;

    const canApplyPredefinedDiscount = hasServerPermissions
      ? rawPerms.includes('pos.discounts.predefined.apply') ||
        rawPerms.includes('pos.discount.predefined.apply') ||
        rawPerms.includes('APPLY_PREDEFINED_DISCOUNTS')
      : true;

    // Optional branch filter from query (?branchId=...)
    const branchIdFilterRaw =
      typeof req.query.branchId === 'string'
        ? (req.query.branchId as string)
        : undefined;

    const branchIdFilter = branchIdFilterRaw
      ? String(branchIdFilterRaw)
      : undefined;

    const methods = await prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const schedulers = await prisma.posScheduler.findMany({
      where: { isActive: true, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });

    const aggregators = await prisma.posAggregator.findMany({
      where: { isActive: true, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });

    // ✅ only not-deleted discounts (no isActive field on Discount)
    const discountRows = await prisma.discount.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
    });

    // Link tables (branches / categories / product sizes)
    const [branchLinks, categoryLinks, productSizeLinks] = await Promise.all([
      prisma.discountBranch.findMany({
        select: { discountId: true, branchId: true },
      }),
      prisma.discountCategory.findMany({
        select: { discountId: true, categoryId: true },
      }),
      prisma.discountProductSize.findMany({
        select: { discountId: true, productSizeId: true, productId: true },
      }),
    ]);

    const branchMap: Record<string, string[]> = {};
    branchLinks.forEach((l) => {
      const dId = String(l.discountId);
      if (!branchMap[dId]) branchMap[dId] = [];
      branchMap[dId].push(String(l.branchId));
    });

    const categoryMap: Record<string, string[]> = {};
    categoryLinks.forEach((l) => {
      const dId = String(l.discountId);
      if (!categoryMap[dId]) categoryMap[dId] = [];
      categoryMap[dId].push(String(l.categoryId));
    });

    // We want both productIds and productSizeIds from DiscountProductSize
    const productMap: Record<string, string[]> = {};
    const productSizeMap: Record<string, string[]> = {};
    productSizeLinks.forEach((l) => {
      const dId = String(l.discountId);
      if (!productSizeMap[dId]) productSizeMap[dId] = [];
      productSizeMap[dId].push(String(l.productSizeId));

      if (l.productId) {
        if (!productMap[dId]) productMap[dId] = [];
        productMap[dId].push(String(l.productId));
      }
    });

    const allDiscounts = discountRows.map((d) => {
      const mode: 'AMOUNT' | 'PERCENT' =
        d.type === 'PERCENTAGE' ? 'PERCENT' : 'AMOUNT';

      const q = d.qualification as 'PRODUCT' | 'ORDER' | 'ORDER_AND_PRODUCT';
      const scope: 'ORDER' | 'ITEM' = q === 'PRODUCT' ? 'ITEM' : 'ORDER';

      const dId = String(d.id);
      const branchIds = branchMap[dId] ?? [];
      const categoryIds = categoryMap[dId] ?? [];
      const productIds = productMap[dId] ?? [];
      const productSizeIds = productSizeMap[dId] ?? [];

      return {
        id: dId,
        name: d.name,
        nameLocalized: d.nameLocalized ?? null,
        type: d.type,
        qualification: d.qualification,
        value: Number(d.value) || 0,
        mode,
        scope,
        taxable: d.taxable ?? false,
        reference: d.reference ?? null,
        maxDiscount: d.maxDiscount ?? null,
        minProductPrice: d.minProductPrice ?? null,
        orderTypes: d.orderTypes ?? null,
        applyAllBranches: d.applyAllBranches ?? false,
        branchIds,
        categoryIds,
        productIds,
        productSizeIds,
      };
    });

    // 🔍 Filter by branch (string-safe)
    const discountsAfterBranchFilter = allDiscounts.filter((d) => {
      const hasBranchAssignments = d.branchIds && d.branchIds.length > 0;

      if (d.applyAllBranches) return true;
      if (!hasBranchAssignments) return false;
      if (!branchIdFilter) return false;

      const match = d.branchIds.map(String).includes(String(branchIdFilter));
      return match;
    });

    // 🔐 Apply role-based permission filter
    const discountsForUser = canApplyPredefinedDiscount
      ? discountsAfterBranchFilter
      : [];

    console.log(
      '📦 /pos/config discounts summary:',
      JSON.stringify(
        {
          totalInDb: discountRows.length,
          totalAfterBranchFilter: discountsAfterBranchFilter.length,
          totalAfterPermissionFilter: discountsForUser.length,
          branchIdFilter,
          canApplyOpenDiscount,
          canApplyPredefinedDiscount,
        },
        null,
        2,
      ),
    );

    return res.json({
      vatRate,
      paymentMethods: methods.map((m) => ({
        id: m.id,
        code: m.code ?? null,
        name: m.name,
      })),
      schedulers: schedulers.map((s) => ({
        id: s.id,
        name: s.name,
        reference: s.reference,
        intervalMinutes: s.intervalMinutes,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        createdById: s.createdById ?? null,
        updatedById: s.updatedById ?? null,
      })),
      aggregators: aggregators.map((a) => ({
        id: a.id,
        name: a.name,
        reference: a.reference,
        isActive: a.isActive,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        createdById: a.createdById ?? null,
        updatedById: a.updatedById ?? null,
      })),
      discounts: discountsForUser,
      discountPermissions: {
        canApplyOpenDiscount,
        canApplyPredefinedDiscount,
      },
    });
  } catch (err) {
    console.error('GET /pos/config FATAL ERROR:', err);
    return res
      .status(500)
      .json({ error: 'Failed to load POS config', details: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/* Customers schema                                                   */
/* ------------------------------------------------------------------ */

const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(5, 'Phone is required'),
  email: z
    .string()
    .email('Invalid email')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
});

/* ------------------------------------------------------------------ */
/* GET /pos/customers?search=                                         */
/* ------------------------------------------------------------------ */

router.get('/customers', async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string | undefined)?.trim() || '';

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {};

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json(
      customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
      })),
    );
  } catch (err: any) {
    console.error('GET /pos/customers ERROR', err);
    return res.status(500).json({
      error: 'Failed to load customers',
      details: err?.message,
    });
  }
});

/* ------------------------------------------------------------------ */
/* POST /pos/customers                                                */
/* ------------------------------------------------------------------ */

router.post('/customers', async (req: Request, res: Response) => {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { name, phone, email } = parsed.data;

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        ...(email ? { email } : {}),
      },
    });

    return res.status(201).json(customer);
  } catch (err: any) {
    if (err.code === 'P2002') {
      const target = err.meta?.target as string[] | string | undefined;
      const targetStr = Array.isArray(target)
        ? target.join(',')
        : String(target || '');

      let message = 'Customer already exists';
      if (targetStr.includes('phone')) {
        message = 'Customer with this phone already exists';
      } else if (targetStr.includes('email')) {
        message = 'Customer with this email already exists';
      }

      return res.status(409).json({
        error: message,
        field: err.meta?.target,
      });
    }

    console.error('POST /pos/customers ERROR', err);
    return res.status(500).json({
      error: 'Failed to create customer',
      details: err?.message,
    });
  }
});

/* ------------------------------------------------------------------ */
/* Helper: map orderType label from POS screen → Prisma enum          */
/* ------------------------------------------------------------------ */

function mapOrderTypeLabel(
  label?: string | null,
): 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY' | 'DRIVE_THRU' | 'B2B' {
  if (!label) return 'DINE_IN';
  const v = String(label).toLowerCase();
  if (v.includes('dine')) return 'DINE_IN';
  if (v.includes('pick') || v.includes('take')) return 'TAKE_AWAY';
  if (v.includes('drive')) return 'DRIVE_THRU';
  if (v.includes('b2b')) return 'B2B';
  if (v.includes('deliv')) return 'DELIVERY';
  return 'DINE_IN';
}

/* ------------------------------------------------------------------ */
/* POST /pos/orders                                                   */
/* ------------------------------------------------------------------ */

router.post('/orders', async (req: AuthedRequest, res: Response) => {
  try {
    const {
      // ✅ NEW REQUIRED (because Prisma models require them)
      brandId: brandIdFromBody,
      deviceId: deviceIdFromBody,

      branchId: branchIdFromBody,
      branchName,
      userName,
      orderType,
      subtotalEx,
      vatAmount,
      vatRate,
      total,
      status: statusFromClient,
      channel: channelFromClient,
      items,
      payments,
      discountAmount,
      discount,
      customerId,
    } = req.body;

    const branchIdFromQuery =
      typeof req.query.branchId === 'string'
        ? (req.query.branchId as string)
        : undefined;

    console.log('🔔 POST /pos/orders BODY:', JSON.stringify(req.body, null, 2));
    console.log('🔔 POST /pos/orders QUERY:', req.query);

    // ✅ Validate required fields (brand/device)
    const brandId =
      typeof brandIdFromBody === 'string' ? brandIdFromBody.trim() : '';
    const deviceId =
      typeof deviceIdFromBody === 'string' ? deviceIdFromBody.trim() : '';

    if (!brandId) {
      return res.status(400).json({ error: 'brandId required' });
    }
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    const rawStatus = statusFromClient
      ? String(statusFromClient).toUpperCase()
      : '';

    let status: 'ACTIVE' | 'CLOSED' | 'VOID';
    if (rawStatus === 'ACTIVE') status = 'ACTIVE';
    else if (rawStatus === 'VOID') status = 'VOID';
    else if (rawStatus === 'CLOSED') status = 'CLOSED';
    else status = 'CLOSED';

    type Channel = 'POS' | 'CallCenter';

    const rawChannelFromBody = channelFromClient
      ? String(channelFromClient).toUpperCase()
      : '';

    const rawChannelFromQuery = req.query.channel
      ? String(req.query.channel).toUpperCase()
      : '';

    let channel: Channel = 'POS';
    if (
      rawChannelFromBody === 'CALLCENTER' ||
      rawChannelFromQuery === 'CALLCENTER'
    ) {
      channel = 'CallCenter';
    } else {
      channel = 'POS';
    }

    console.log('✅ RESOLVED CHANNEL:', channel);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must have items' });
    }

    if (status === 'CLOSED') {
      if (!payments || !Array.isArray(payments) || payments.length === 0) {
        return res
          .status(400)
          .json({ error: 'Closed orders must have at least one payment' });
      }
    }

    /* -------------------- Resolve Branch -------------------- */
    let branchId: string | null = null;
    const candidateBranchId = branchIdFromBody || branchIdFromQuery;

    if (candidateBranchId) {
      const byId = await prisma.branch.findUnique({
        where: { id: candidateBranchId },
      });
      if (byId) {
        branchId = byId.id;
      } else {
        console.warn(
          '⚠️ POST /pos/orders: Provided branchId not found:',
          candidateBranchId,
        );
      }
    }

    if (!branchId && branchName) {
      const byName = await prisma.branch.findFirst({
        where: { name: branchName },
      });
      if (byName) {
        branchId = byName.id;
      } else {
        console.warn(
          '⚠️ POST /pos/orders: Provided branchName not found:',
          branchName,
        );
      }
    }

    if (!branchId) {
      const anyBranch = await prisma.branch.findFirst();
      if (!anyBranch) {
        return res
          .status(400)
          .json({ error: 'No branch found to attach order to' });
      }
      branchId = anyBranch.id;
      console.warn(
        '⚠️ POST /pos/orders: Falling back to first branch in DB, id=',
        branchId,
      );
    }

    console.log('✅ RESOLVED BRANCH:', {
      branchId,
      branchIdFromBody,
      branchIdFromQuery,
      branchName,
    });

    const prefix = channel === 'CallCenter' ? 'CC' : 'POS';
    const orderNo = `${prefix}-${Date.now()}`;

    const now = new Date();
    const businessDate = now;

    let ratePercent: number;
    if (typeof vatRate === 'number' && vatRate > 0) {
      ratePercent = vatRate;
    } else {
      ratePercent = await getVatPercentFromDb();
    }
    const vatFraction = ratePercent / 100;

    // 🔹 Compute discountTotal + kind + value for DB
    const topLevelAmount =
      typeof discountAmount === 'number' ? discountAmount : 0;
    const nestedAmount =
      discount && typeof discount.amount === 'number' ? discount.amount : 0;

    const discountTotalValue =
      topLevelAmount > 0
        ? topLevelAmount
        : nestedAmount > 0
        ? nestedAmount
        : 0;

    let discountKindForDb: DiscountType | null = null;
    let discountValueForDb: Prisma.Decimal | null = null;

    if (discount && discount.kind && discount.value != null) {
      const kindUpper = String(discount.kind).toUpperCase();
      if (kindUpper === 'PERCENT' || kindUpper === 'PERCENTAGE') {
        discountKindForDb = DiscountType.PERCENTAGE;
      } else {
        discountKindForDb = DiscountType.FIXED;
      }
      discountValueForDb = new Prisma.Decimal(Number(discount.value) || 0);
    }

    console.log('💸 /pos/orders discount debug', {
      discountAmount,
      discountFromObj: discount?.amount,
      discountTotalValue,
      discountKindForDb,
      discountValueForDb: discountValueForDb?.toString(),
      customerId,
      brandId,
      deviceId,
    });

    const itemCreates = (items as any[]).map((i) => {
      const qty = Number(i.qty || 0);
      const unitPrice = Number(i.unitPrice || 0);
      const lineTotal = qty * unitPrice;

      let lineTax = 0;
      if (vatFraction > 0) {
        const exVat = lineTotal / (1 + vatFraction);
        lineTax = lineTotal - exVat;
      }

      const modifiers =
        i.modifiers && Array.isArray(i.modifiers) && i.modifiers.length > 0
          ? {
              create: i.modifiers.map((m: any) => ({
                brandId,
                deviceId,
                modifierItemId: String(m.modifierItemId ?? m.itemId ?? m.id),
                price: Number(m.price ?? 0),
                qty: Number(m.qty ?? 1),
              })),
            }
          : undefined;

      return {
        brandId,
        deviceId,
        productId: String(i.productId),
        size: i.sizeName ? String(i.sizeName) : null,
        qty,
        unitPrice,
        tax: lineTax,
        total: lineTotal,
        ...(modifiers ? { modifiers } : {}),
      };
    });

    const paymentCreates =
      status === 'CLOSED' && Array.isArray(payments)
        ? (payments as any[]).map((p) => ({
            brandId,
            deviceId,
            paymentMethodId: p.methodId ? String(p.methodId) : null,
            method: String(p.methodName ?? p.method ?? 'UNKNOWN'),
            amount: Number(p.amount),
          }))
        : [];

    const orderTypeEnum = mapOrderTypeLabel(orderType);

    const orderData: any = {
      // ✅ REQUIRED relations
      brandId,
      deviceId,

      branchId,
      channel,
      orderNo,
      businessDate,
      status,
      subtotal: subtotalEx,

      // ⬇️ discount meta
      discountTotal: new Prisma.Decimal(discountTotalValue || 0),
      discountKind: discountKindForDb ?? undefined,
      discountValue: discountValueForDb ?? undefined,

      taxTotal: vatAmount,
      netTotal: total,
      orderType: orderTypeEnum,

      // customer
      customerId:
        typeof customerId === 'string' && customerId.trim()
          ? customerId
          : null,

      ...(status === 'CLOSED' ? { closedAt: now } : {}),
      ...(status === 'VOID' ? { voidedAt: now } : {}),

      items: { create: itemCreates },
    };

    if (paymentCreates.length > 0) {
      orderData.payments = { create: paymentCreates };
    }

    const order = await prisma.order.create({
      data: orderData,
      include: {
        items: true,
        payments: true,
      },
    });

    console.log(
      '✅ Order saved:',
      'id =',
      order.id,
      'orderNo =',
      order.orderNo,
      'status =',
      order.status,
      'channel =',
      order.channel,
      'branchId =',
      order.branchId,
      'orderType =',
      order.orderType,
      'customerId =',
      order.customerId,
      'brandId =',
      (order as any).brandId,
      'deviceId =',
      (order as any).deviceId,
      'discountTotal =',
      (order as any).discountTotal?.toString?.() ?? (order as any).discountTotal,
      'discountKind =',
      (order as any).discountKind,
      'discountValue =',
      (order as any).discountValue?.toString?.() ?? (order as any).discountValue,
    );

    return res.status(201).json({
      ok: true,
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      channel: order.channel,
      customerId: order.customerId,
      brandId: (order as any).brandId,
      deviceId: (order as any).deviceId,
    });
  } catch (err) {
    console.error('POST /pos/orders ERROR', err);
    return res
      .status(500)
      .json({ error: 'Failed to create order', details: String(err) });
  }
});

export default router;
