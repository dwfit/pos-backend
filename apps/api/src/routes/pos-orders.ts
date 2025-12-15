// apps/api/src/routes/pos-orders.ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { Prisma, OrderType, DiscountType } from '@prisma/client';

const router = Router();

console.log('🆕 Loaded pos-orders router (v3 with discount saving + customerId)');

/**
 * Schema matching your POS payload
 */
const CreateOrderSchema = z.object({
  branchId: z.string().optional(),
  branchName: z.string().optional(),
  userName: z.string().optional(),
  status: z.string().optional(),

  // ⭐ NEW: customerId from POS (optional)
  customerId: z.string().optional().nullable(),

  vatRate: z.number().optional(),
  subtotalEx: z.number(),
  vatAmount: z.number(),
  total: z.number(),

  // ❗ no .default(0) – we need to detect "not sent" vs "0"
  discountAmount: z.number().optional(),

  discount: z
    .object({
      kind: z.string().optional(), // "AMOUNT" | "PERCENT"
      value: z.number().optional(), // 8 or 10 (percent)
      amount: z.number().optional(), // final discount amount from POS
      source: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      configId: z.string().nullable().optional(),
      scope: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),

  orderType: z.string(),
  channel: z.string().optional(),
  businessDate: z.string().optional(), // "YYYY-MM-DD"

  items: z.array(
    z.object({
      productId: z.string(),
      productName: z.string().optional(),
      sizeId: z.string().optional(),
      sizeName: z.string().nullable().optional(),
      qty: z.number(),
      unitPrice: z.number(),
      modifiers: z.array(z.any()).optional(),
    }),
  ),

  payments: z.array(
    z.object({
      methodId: z.string(),
      methodName: z.string().optional(),
      amount: z.number(),
    }),
  ),
});

/* ------------------------- helpers ------------------------- */

function toNumber(v: any, fallback = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (v == null) return fallback;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? fallback : n;
}

async function resolveBranchId(input: any): Promise<string | null> {
  const s = typeof input === 'string' ? input.trim() : '';
  if (!s) return null;

  const b = await prisma.branch.findFirst({
    where: {
      OR: [{ id: s }, { code: s }, { reference: s }, { name: s }],
    },
    select: { id: true },
  });

  return b?.id ?? null;
}

function mapOrderType(rawOrderType: string): OrderType {
  const upper = rawOrderType.toUpperCase();

  if (upper in OrderType) return (OrderType as any)[upper] as OrderType;

  const label = rawOrderType.toLowerCase();

  if (label.includes('dine')) return OrderType.DINE_IN;
  if (label.includes('pick') || label.includes('take')) return OrderType.TAKE_AWAY;
  if (label.includes('drive')) return OrderType.DRIVE_THRU;
  if (label.includes('deliver')) return OrderType.DELIVERY;
  if (label.includes('b2b')) return OrderType.B2B;

  return OrderType.DINE_IN;
}

function normalizeStatus(rawStatus: string | undefined): string {
  const s = (rawStatus ?? '').toUpperCase();
  if (s === 'CLOSED') return 'CLOSED';
  if (s === 'VOID') return 'VOID';
  if (s === 'ACTIVE') return 'ACTIVE';
  return 'CLOSED';
}

/**
 * Simple example order number generator
 */
async function generateOrderNo(branchId: string): Promise<string> {
  const count = await prisma.order.count({ where: { branchId } });
  const next = count + 1;
  return `${branchId.slice(0, 4).toUpperCase()}-${String(next).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------ */
/*  POST /pos/orders – called from POS app to save finalised order    */
/* ------------------------------------------------------------------ */

router.post('/pos/orders', async (req, res) => {
  try {
    console.log('📥 /pos/orders raw body:', JSON.stringify(req.body, null, 2));

    const body = CreateOrderSchema.parse(req.body);

    console.log('🔔 /pos/orders parsed BODY:', JSON.stringify(body, null, 2));

    const {
      branchId: branchIdRaw,
      branchName,
      status: statusRaw,
      subtotalEx,
      vatAmount,
      total,
      discountAmount,
      discount,
      orderType: orderTypeRaw,
      channel: channelRaw,
      businessDate,
      items,
      payments,
      customerId,
    } = body;

    // ---------- branch ----------
    const branchId =
      branchIdRaw ||
      (await resolveBranchId(branchName));

    if (!branchId) {
      console.error('❌ /pos/orders cannot resolve branch', {
        branchIdRaw,
        branchName,
      });
      return res
        .status(400)
        .json({ error: 'Invalid branch: branchId / branchName not found' });
    }

    // ---------- channel, status, orderType ----------
    const dbChannel: 'POS' | 'CallCenter' =
      String(channelRaw || 'POS').toUpperCase() === 'CALLCENTER'
        ? 'CallCenter'
        : 'POS';

    const status = normalizeStatus(statusRaw);
    const orderType = mapOrderType(orderTypeRaw);

    // ---------- businessDate ----------
    let businessDateObj: Date;
    if (businessDate && businessDate.trim()) {
      const d = new Date(`${businessDate}T00:00:00`);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid businessDate' });
      }
      businessDateObj = d;
    } else {
      const today = new Date();
      businessDateObj = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
    }

    // ---------- totals ----------
    const subtotal = subtotalEx; // ex-VAT subtotal from POS
    const taxTotal = vatAmount;
    const netTotal = total;

    // ---------- discount (what goes to DB) ----------
    // 1) if discountAmount > 0 → use it
    // 2) else if discount.amount > 0 → use that
    // 3) else 0
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

    // discount kind + discount value
    let discountKindForDb: DiscountType | null = null;
    let discountValueForDb: Prisma.Decimal | null = null;

    if (discount && discount.kind && discount.value != null) {
      const kindUpper = discount.kind.toUpperCase();
      if (kindUpper === 'PERCENT' || kindUpper === 'PERCENTAGE') {
        discountKindForDb = DiscountType.PERCENTAGE;
      } else {
        // "AMOUNT" or anything else → FIXED
        discountKindForDb = DiscountType.FIXED;
      }
      discountValueForDb = new Prisma.Decimal(discount.value);
    }

    console.log('💸 /pos/orders discount debug', {
      discountAmount,
      discountFromObj: discount?.amount,
      discountTotalValue,
      discountKindForDb,
      discountValueForDb: discountValueForDb?.toString(),
    });

    // ---------- items ----------
    if (!items.length) {
      return res.status(400).json({ error: 'Order items are required' });
    }

    const itemsData = items.map((it) => ({
      productId: it.productId,
      size: it.sizeName ?? null,
      qty: it.qty,
      unitPrice: new Prisma.Decimal(it.unitPrice),
      // If you want exact per-line tax, you can compute using vatRate later
      tax: new Prisma.Decimal(0),
      total: new Prisma.Decimal(it.unitPrice * it.qty),
    }));

    // ---------- payments ----------
    const paymentsData = await Promise.all(
      payments.map(async (p) => {
        const pm = await prisma.paymentMethod.findUnique({
          where: { id: p.methodId },
        });

        if (!pm) {
          throw new Error(`Invalid paymentMethodId: ${p.methodId}`);
        }

        return {
          paymentMethodId: pm.id,
          method: p.methodName || pm.nameLocalized || pm.name,
          amount: new Prisma.Decimal(p.amount),
          ref: null,
        };
      }),
    );

    // ---------- create order ----------
    console.log('📝 /pos/orders saving order with:', {
      branchId,
      subtotal,
      taxTotal,
      netTotal,
      discountTotalValue,
      channel: dbChannel,
      status,
      customerId,
    });

    const order = await prisma.order.create({
      data: {
        branchId,
        channel: dbChannel,
        orderType,
        orderNo: await generateOrderNo(branchId),
        businessDate: businessDateObj,
        status,
        subtotal: new Prisma.Decimal(subtotal),

        // ⭐ NEW: save customerId for POS orders also
        customerId: customerId ?? null,

        // ⬇⬇ final discount fields in DB
        discountTotal: new Prisma.Decimal(discountTotalValue),
        discountKind: discountKindForDb,
        discountValue: discountValueForDb,

        taxTotal: new Prisma.Decimal(taxTotal),
        netTotal: new Prisma.Decimal(netTotal),
        closedAt: status === 'CLOSED' ? new Date() : null,

        items: { create: itemsData },
        payments: { create: paymentsData },
      },
      include: {
        items: true,
        payments: {
          include: { paymentMethod: { include: { type: true } } },
        },
        // optional: include customer if you want
        customer: true,
      },
    });

    console.log('✅ /pos/orders created order', {
      id: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,           // ⭐ debug
      discountTotal: order.discountTotal.toString(),
      discountKind: order.discountKind,
      discountValue: order.discountValue?.toString(),
    });

    // Compact response for POS – now includes discount info + customerId
    return res.status(201).json({
      ok: true,
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      channel: order.channel,
      discountTotal: order.discountTotal,
      discountKind: order.discountKind,
      discountValue: order.discountValue,
      // ⭐ return it so POS/callcenter can see what was linked
      customerId: order.customerId,
    });
  } catch (err: any) {
    console.error('❌ POST /pos/orders error:', err);
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid payload', issues: err.errors });
    }
    res.status(500).json({ error: 'Failed to create order' });
  }
});

export default router;
