// apps/api/src/routes/callcenter.ts
import { Router } from 'express';
import { prisma } from '../db';
import { Decimal } from '@prisma/client/runtime/library';
import { broadcastCallcenterOrder } from '../ws'; 

const router = Router();

/* -------------------- Debug helpers -------------------- */

router.get('/debug', (req, res) => {
  console.log('CALLCENTER DEBUG HIT');
  res.json({ ok: true, scope: 'callcenter' });
});

router.get('/orders/debug', async (req, res) => {
  try {
    const rows = await prisma.order.findMany({
      // accept both possible stored values, just in case
      where: { channel: { in: ['CALLCENTER', 'CallCenter'] as any } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        items: true,
      },
    });
    res.json(rows);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load callcenter orders' });
  }
});

/* ---------------- In-memory SSE bus ---------------- */
type Client = { id: string; res: any };
const clients: Client[] = [];

function publishStatus(
  orderId: string,
  status: 'pending' | 'active' | 'done' | 'declined'
) {
  const payload = `data: ${JSON.stringify({ type: 'status', orderId, status })}\n\n`;
  for (const c of clients) c.res.write(payload);
}

/* ---------------- Helpers ---------------- */

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Simple order number: CC-YYYYMMDD-XXXX
async function generateOrderNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CC-${y}${m}${day}-${rand}`;
}

// taxRate helper – accepts 0.15 or 15
function rateToDecimal(r?: number | null) {
  if (r == null || !isFinite(Number(r))) return 0;
  const n = Number(r);
  return n < 1 ? n : n / 100; // 0.15 or 15 → 0.15
}

function splitInclusiveDecimal(amount: Decimal, rateDec: number) {
  const r = new Decimal(rateDec);
  const onePlus = new Decimal(1).add(r);
  const net = amount.div(onePlus);
  const vat = amount.sub(net);
  return { net, vat, gross: amount };
}

/* ---------------- Create order from Call Center ---------------- */
router.post('/orders', async (req, res) => {
  try {
    const {
      deviceId,
      branchId,
      items = [],
      customerName,
      customerMobile,
      notes,
    } = req.body as {
      deviceId: string;
      branchId?: string;
      items: {
        productId: string;
        qty: number;
        size?: { id: string; name: string; code?: string };
        modifiers?: { id: string; name: string; price: number }[];
      }[];
      customerName?: string;
      customerMobile?: string;
      notes?: string;
    };

    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    if (!items.length) return res.status(400).json({ error: 'items required' });

    // Determine final branchId
    let finalBranchId: string | null = branchId ?? null;

    if (!finalBranchId) {
      const dev = await prisma.device.findUnique({
        where: { id: deviceId },
        select: { id: true, branchId: true },
      });
      if (!dev) return res.status(404).json({ error: 'Device not found' });
      finalBranchId = dev.branchId;
    }

    if (!finalBranchId) {
      return res.status(400).json({ error: 'No branch linked to this device' });
    }

    // Upsert/find customer by phone (optional)
    let customerId: string | undefined = undefined;
    if (customerMobile) {
      const cust = await prisma.customer.upsert({
        where: { phone: customerMobile },
        update: { name: customerName ?? undefined },
        create: { name: customerName || 'Customer', phone: customerMobile },
        select: { id: true },
      });
      customerId = cust.id;
    }

    // Load product data to compute pricing/tax
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        basePrice: true,
        taxRate: true, // 0.15 or 15
      },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    // Totals (net & tax from VAT-inclusive prices)
    let subtotal = new Decimal(0); // ex-VAT
    let taxTotal = new Decimal(0);

    const orderItemsData = items.map((i) => {
      const p = pMap.get(i.productId);
      if (!p) throw new Error(`Product not found: ${i.productId}`);

      const rateDec = rateToDecimal(p.taxRate);

      const modifiersArr = i.modifiers ?? [];
      const modsTotal = modifiersArr.reduce(
        (acc, m) => acc.add(new Decimal(m.price || 0)),
        new Decimal(0),
      );

      // Treat basePrice as VAT-inclusive (menu price), then add modifiers
      const baseGross = new Decimal(p.basePrice ?? 0);
      const unitGross = baseGross.add(modsTotal);
      const qty = new Decimal(i.qty || 1);
      const lineGross = unitGross.mul(qty);

      const { net: lineNet, vat: lineVat } = splitInclusiveDecimal(lineGross, rateDec);

      subtotal = subtotal.add(lineNet);
      taxTotal = taxTotal.add(lineVat);

      // create nested OrderItemModifiers so they show on reopen
      const modifierCreates =
        modifiersArr.length > 0
          ? modifiersArr.map((m) => ({
              modifierItemId: m.id,
              qty: 1,
              price: m.price ?? 0,
            }))
          : [];

      return {
        productId: i.productId,
        // store size NAME so POS can show it directly
        size: i.size?.name || null,
        qty: qty.toNumber(),
        unitPrice: unitGross, // VAT-inclusive unit price
        tax: lineVat,
        total: lineGross,
        notes: notes ?? null,
        modifiers:
          modifierCreates.length > 0
            ? {
                create: modifierCreates,
              }
            : undefined,
      };
    });

    const netTotal = subtotal.add(taxTotal);

    const baseOrderData: any = {
      branchId: finalBranchId,
      customerId,
      orderNo: await generateOrderNo(),
      businessDate: todayStart(),
      status: 'PENDING',
      subtotal,
      discountTotal: new Decimal(0),
      taxTotal,
      netTotal,
      items: { create: orderItemsData },
    };

    let order;

    // 1️⃣ Try with the desired values
    try {
      order = await prisma.order.create({
        data: {
          ...baseOrderData,
          channel: 'CALLCENTER' as any,
          orderType: 'PICK_UP' as any,
        },
        select: {
          id: true,
          status: true,
          channel: true,
          orderType: true,
          orderNo: true,
          branchId: true,
          createdAt: true,
        },
      });
      console.log('✅ Callcenter order created with CALLCENTER / PICK_UP');
    } catch (err: any) {
      console.error(
        '❌ Failed to create order with CALLCENTER / PICK_UP, retrying with fallback',
        err?.message || err
      );

      // 2️⃣ Fallback: keep channel similar to old code, no forced orderType
      order = await prisma.order.create({
        data: {
          ...baseOrderData,
          channel: 'CallCenter' as any,
        },
        select: {
          id: true,
          status: true,
          channel: true,
          orderType: true,
          orderNo: true,
          branchId: true,
          createdAt: true,
        },
      });
      console.log('✅ Callcenter order created with fallback channel=CallCenter');
    }

    // Notify dashboards via SSE as pending initially
    publishStatus(order.id, 'pending');

    // 🔔 NEW: Notify mobile/tablets via WebSocket
    broadcastCallcenterOrder({
      ...order,
      channel: 'CallCenter', // normalize so WS helper sees it
    });

    return res.status(201).json(order);
  } catch (e: any) {
    console.error('POST /api/callcenter/orders FATAL', e);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

/* ---------------- Device updates order status ---------------- */
router.patch('/orders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { status, payment } = req.body as {
      status: 'active' | 'done' | 'declined';
      payment?: { method: string; amount: number; ref?: string };
    };

    if (!['active', 'done', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Map SSE status -> DB enum
    let dbStatus: 'ACTIVE' | 'CLOSED' | 'DECLINED';
    if (status === 'active') dbStatus = 'ACTIVE';
    else if (status === 'done') dbStatus = 'CLOSED';
    else dbStatus = 'DECLINED';

    const data: any = { status: dbStatus };
    if (status === 'done') data.closedAt = new Date();

    const updated = await prisma.order.update({
      where: { id },
      data,
      select: {
        id: true,
        status: true,
        channel: true,
        orderType: true,
        branchId: true,
        createdAt: true,
      },
    });

    if (status === 'done' && payment?.method && payment?.amount != null) {
      await prisma.payment.create({
        data: {
          orderId: id,
          method: payment.method,
          amount: new Decimal(payment.amount),
          ref: payment.ref || null,
        } as any,
      });
    }

    // SSE update for web dashboard
    publishStatus(updated.id, status);

    // 🔔 NEW: WebSocket update for mobile/tablets
    if (updated.channel === 'CALLCENTER' || updated.channel === 'CallCenter') {
      broadcastCallcenterOrder({
        ...updated,
        channel: 'CallCenter', // normalize
      });
    }

    return res.json(updated);
  } catch (e: any) {
    console.error('PATCH /api/callcenter/orders/:id ERROR', e);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

/* ---------------- SSE stream for web dashboard ---------------- */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const id = Math.random().toString(36).slice(2);
  clients.push({ id, res });

  res.write(`: connected ${id}\n\n`);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

export default router;
