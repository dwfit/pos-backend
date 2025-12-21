// apps/api/src/routes/callcenter.ts
import { Router } from "express";
import { prisma } from "../db";
import { Decimal } from "@prisma/client/runtime/library";
import { broadcastCallcenterOrder } from "../ws";

const router = Router();

/* -------------------- Constants -------------------- */

// Keep ONE canonical value only
const CC_CHANNEL = "CALLCENTER" as const;
// If you upgraded schema to enum OrderChannel, this should still work via "as any".

/* -------------------- Debug helpers -------------------- */

router.get("/debug", (req, res) => {
  console.log("CALLCENTER DEBUG HIT");
  res.json({ ok: true, scope: "callcenter" });
});

router.get("/orders/debug", async (req, res) => {
  try {
    const rows = await prisma.order.findMany({
      // Support legacy data too
      where: { channel: { in: ["CALLCENTER", "CallCenter"] as any } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: true },
    });
    res.json(rows);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to load callcenter orders" });
  }
});

/* ---------------- In-memory SSE bus ---------------- */
type Client = { id: string; res: any };
const clients: Client[] = [];

function publishStatus(
  orderId: string,
  status: "pending" | "active" | "done" | "declined"
) {
  const payload = `data: ${JSON.stringify({ type: "status", orderId, status })}\n\n`;
  for (const c of clients) c.res.write(payload);
}

/* ---------------- Helpers ---------------- */

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function generateOrderNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CC-${y}${m}${day}-${rand}`;
}

function rateToDecimal(r?: number | null) {
  if (r == null || !isFinite(Number(r))) return 0;
  const n = Number(r);
  return n < 1 ? n : n / 100;
}

function splitInclusiveDecimal(amount: Decimal, rateDec: number) {
  const r = new Decimal(rateDec);
  const onePlus = new Decimal(1).add(r);
  const net = amount.div(onePlus);
  const vat = amount.sub(net);
  return { net, vat, gross: amount };
}

async function resolveBrandIdOrThrow(args: { uiBrandId?: string; branchId: string }) {
  const br = await prisma.branch.findUnique({
    where: { id: args.branchId },
    select: { id: true, brandId: true },
  });

  if (!br) {
    return {
      brandId: null as string | null,
      branchBrandId: null as string | null,
    };
  }

  const branchBrandId = br.brandId ?? null;
  const uiBrandId = args.uiBrandId?.trim() ? args.uiBrandId.trim() : null;

  if (uiBrandId) {
    const exists = await prisma.brand.findUnique({
      where: { id: uiBrandId },
      select: { id: true },
    });
    if (!exists) throw new Error("Selected brand not found");
  }

  if (branchBrandId && uiBrandId && branchBrandId !== uiBrandId) {
    throw new Error("Selected brand does not match branch brand");
  }

  const finalBrandId = uiBrandId || branchBrandId;
  return { brandId: finalBrandId, branchBrandId };
}

async function resolveBranchIdFromPosDeviceOrThrow(deviceId: string) {
  const dev = await prisma.posDevice.findUnique({
    where: { id: deviceId },
    select: { id: true, branchId: true },
  });

  if (!dev) throw new Error("PosDevice not found (deviceId invalid)");
  if (!dev.branchId) throw new Error("No branch linked to this device");
  return dev.branchId;
}

/* ---------------- Create order from Call Center ---------------- */
router.post("/orders", async (req, res) => {
  try {
    const {
      deviceId,
      branchId,
      brandId: uiBrandId,
      items = [],
      customerName,
      customerMobile,
      notes,
    } = req.body as {
      deviceId: string;
      branchId?: string;
      brandId?: string;
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

    if (!deviceId) return res.status(400).json({ error: "deviceId required" });
    if (!items.length) return res.status(400).json({ error: "items required" });

    // Determine final branchId
    let finalBranchId: string | null = branchId ?? null;
    if (!finalBranchId) {
      finalBranchId = await resolveBranchIdFromPosDeviceOrThrow(deviceId);
    }
    if (!finalBranchId) {
      return res.status(400).json({ error: "No branch linked to this device" });
    }

    // Resolve brandId (required)
    const { brandId: finalBrandId } = await resolveBrandIdOrThrow({
      uiBrandId,
      branchId: finalBranchId,
    });

    if (!finalBrandId) {
      return res.status(400).json({ error: "brandId required" });
    }

    // Upsert/find customer by phone (optional)
    let customerId: string | null = null;
    if (customerMobile) {
      const cust = await prisma.customer.upsert({
        where: { phone: customerMobile },
        update: { ...(customerName ? { name: customerName } : {}) },
        create: { name: customerName || "Customer", phone: customerMobile },
        select: { id: true },
      });
      customerId = cust.id;
    }

    // Load product data to compute pricing/tax
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, basePrice: true, taxRate: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    // Totals
    let subtotal = new Decimal(0);
    let taxTotal = new Decimal(0);

    const orderItemsData = items.map((i) => {
      const p = pMap.get(i.productId);
      if (!p) throw new Error(`Product not found: ${i.productId}`);

      const rateDec = rateToDecimal(p.taxRate);

      const modifiersArr = i.modifiers ?? [];
      const modsTotal = modifiersArr.reduce(
        (acc, m) => acc.add(new Decimal(m.price || 0)),
        new Decimal(0)
      );

      const baseGross = new Decimal(p.basePrice ?? 0);
      const unitGross = baseGross.add(modsTotal);
      const qty = new Decimal(i.qty || 1);
      const lineGross = unitGross.mul(qty);

      const { net: lineNet, vat: lineVat } = splitInclusiveDecimal(lineGross, rateDec);

      subtotal = subtotal.add(lineNet);
      taxTotal = taxTotal.add(lineVat);

      const modifierCreates =
        modifiersArr.length > 0
          ? modifiersArr.map((m) => ({
              modifierItem: { connect: { id: m.id } },
              qty: 1,
              price: m.price ?? 0,
              brand: { connect: { id: finalBrandId } },
              device: { connect: { id: deviceId } },
            }))
          : [];

      const row: any = {
        product: { connect: { id: i.productId } },
        size: i.size?.name || null,
        qty: qty.toNumber(),
        unitPrice: unitGross,
        tax: lineVat,
        total: lineGross,
        notes: notes ?? null,

        brand: { connect: { id: finalBrandId } },
        device: { connect: { id: deviceId } },
      };

      if (modifierCreates.length > 0) row.modifiers = { create: modifierCreates };
      return row;
    });

    const netTotal = subtotal.add(taxTotal);

    // ✅ IMPORTANT: Always store canonical channel, and do NOT fallback to another value
    const order = await prisma.order.create({
      data: {
        branch: { connect: { id: finalBranchId } },
        brand: { connect: { id: finalBrandId } },
        device: { connect: { id: deviceId } },

        ...(customerId ? { customer: { connect: { id: customerId } } } : {}),

        channel: CC_CHANNEL as any,

        // Your enum doesn't have PICK_UP.
        // Use TAKE_AWAY (closest) unless you decide to add PICK_UP to enum OrderType.
        orderType: "TAKE_AWAY" as any,

        orderNo: await generateOrderNo(),
        businessDate: todayStart(),

        status: "PENDING",
        subtotal,
        discountTotal: new Decimal(0),
        taxTotal,
        netTotal,

        items: { create: orderItemsData },
      },
      select: {
        id: true,
        status: true,
        channel: true,
        orderType: true,
        orderNo: true,
        createdAt: true,
        branch: { select: { id: true } },
        brand: { select: { id: true } },
        device: { select: { id: true } },
      },
    });

    publishStatus(order.id, "pending");

    // ✅ Broadcast exactly what DB has (no rewriting to "CallCenter")
    broadcastCallcenterOrder(order);

    return res.status(201).json(order);
  } catch (e: any) {
    console.error("POST /api/callcenter/orders FATAL", e);
    return res.status(500).json({ error: e?.message || "Failed to create order" });
  }
});

/* ---------------- Device updates order status ---------------- */
router.patch("/orders/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { status, payment } = req.body as {
      status: "active" | "done" | "declined";
      payment?: { method: string; amount: number; ref?: string };
    };

    if (!["active", "done", "declined"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Map API status -> DB enum
    let dbStatus: "ACTIVE" | "CLOSED" | "DECLINED";
    if (status === "active") dbStatus = "ACTIVE";
    else if (status === "done") dbStatus = "CLOSED";
    else dbStatus = "DECLINED";

    // ✅ Only allow updates for CALLCENTER orders
    const existing = await prisma.order.findFirst({
      where: {
        id,
        channel: { in: [CC_CHANNEL, "CallCenter"] as any }, // support legacy rows
      },
      select: {
        id: true,
        status: true,
        channel: true,
        brandId: true,
        deviceId: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "CallCenter order not found" });
    }

    // ✅ Prevent reopening closed/declined CC orders (this is what often causes “comes back ACTIVE”)
    if (
      (existing.status === "CLOSED" || existing.status === "DECLINED") &&
      dbStatus === "ACTIVE"
    ) {
      return res.status(409).json({
        error: "Order already finalized",
        status: existing.status,
      });
    }

    const data: any = { status: dbStatus };

    if (dbStatus === "CLOSED") data.closedAt = new Date();

    // ✅ Normalize channel in DB if legacy row had "CallCenter"
    if (existing.channel !== CC_CHANNEL) data.channel = CC_CHANNEL;

    const updated = await prisma.order.update({
      where: { id },
      data,
      select: {
        id: true,
        status: true,
        channel: true,
        orderType: true,
        createdAt: true,
        branch: { select: { id: true } },
        brand: { select: { id: true } },
        device: { select: { id: true } },
      },
    });

    // Create payment when closing
    if (dbStatus === "CLOSED" && payment?.method && payment?.amount != null) {
      await prisma.payment.create({
        data: {
          order: { connect: { id } },
          brand: { connect: { id: updated.brand.id } },
          device: { connect: { id: updated.device.id } },
          method: payment.method,
          amount: new Decimal(payment.amount),
          ref: payment.ref || null,
        } as any,
      });
    }

    publishStatus(updated.id, status);

    // ✅ CC broadcast only
    if (updated.channel === CC_CHANNEL) {
      broadcastCallcenterOrder(updated);
    }

    return res.json(updated);
  } catch (e: any) {
    console.error("PATCH /api/callcenter/orders/:id ERROR", e);
    return res.status(500).json({ error: e?.message || "Failed to update status" });
  }
});

/* ---------------- SSE stream for web dashboard ---------------- */
router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const id = Math.random().toString(36).slice(2);
  clients.push({ id, res });

  res.write(`: connected ${id}\n\n`);

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

export default router;
