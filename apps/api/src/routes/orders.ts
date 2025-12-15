// apps/api/src/routes/orders.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import {
  broadcastCallcenterOrder,
  broadcastDashboardTick,
} from "../ws";

// 👇 NEW: import Prisma + DiscountType so we can store discountKind/discountValue
import { Prisma, DiscountType } from "@prisma/client";

const router = Router();

/* ------------------------------------------------------------------ */
/* Kafka: optional integration (safe even if Kafka is not installed)  */
/* ------------------------------------------------------------------ */

let kafkaReady = false;
let getProducer: (() => Promise<any>) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const kafkaModule = require("../kafka");
  if (kafkaModule && typeof kafkaModule.getProducer === "function") {
    getProducer = kafkaModule.getProducer;
    kafkaReady = true;
    console.log("✅ Kafka integration enabled in orders routes");
  } else {
    console.warn("⚠️ ../kafka found but getProducer() missing – Kafka disabled");
  }
} catch (err) {
  console.warn(
    "⚠️ Kafka not configured (no ../kafka or kafkajs). Orders will work without publishing events."
  );
}

/**
 * Publish order event to Kafka if available.
 * If Kafka is not configured, this is a no-op.
 */
async function publishOrderEvent(eventType: string, order: any) {
  if (!kafkaReady || !getProducer) return;

  try {
    const producer = await getProducer();

    await producer.send({
      topic: "orders", // 🔔 your Kafka topic name
      messages: [
        {
          key: order.branchId ? String(order.branchId) : undefined,
          value: JSON.stringify({
            eventType,
            occurredAt: new Date().toISOString(),
            orderId: order.id,
            branchId: order.branchId,
            status: order.status,
            channel: order.channel,
            businessDate: order.businessDate,
            totals: {
              subtotal: order.subtotal,
              taxTotal: order.taxTotal,
              discountTotal: order.discountTotal,
              netTotal: order.netTotal,
            },
          }),
        },
      ],
    });
  } catch (err) {
    console.error(
      "⚠️ Failed to publish Kafka order event",
      eventType,
      order?.id,
      err
    );
  }
}

/* -------------------- helper: parse YYYY-MM-DD -------------------- */
function parseDay(day?: string | null): Date | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* GET /orders – list orders with filters (NO auth for now)           */
/* ------------------------------------------------------------------ */

router.get("/", async (req, res) => {
  try {
    const { branchId, date, dateFrom, dateTo, status, channel } = req.query as {
      branchId?: string;
      date?: string; // from UI (YYYY-MM-DD)
      dateFrom?: string; // optional range
      dateTo?: string; // optional range
      status?: string;
      channel?: string;
    };

    console.log("🔎 GET /orders query:", req.query);

    // ----- build businessDate filter -----
    let dateFilter: any = {};

    // 1) Single-date filter (?date=YYYY-MM-DD)
    if (date && date.trim() !== "") {
      const start = parseDay(date);
      if (start) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1); // [start, end)

        dateFilter = {
          businessDate: {
            gte: start,
            lt: end,
          },
        };
      }
    }
    // 2) Range filter (?dateFrom / ?dateTo)
    else if (dateFrom || dateTo) {
      const start =
        parseDay(dateFrom ?? "") ?? new Date("1970-01-01T00:00:00");
      const end = dateTo
        ? new Date(`${dateTo}T23:59:59.999`)
        : new Date("2999-01-01T23:59:59.999");

      dateFilter = {
        businessDate: {
          gte: start,
          lte: end,
        },
      };
    }

    console.log("📅 dateFilter:", JSON.stringify(dateFilter, null, 2));

    // normalize channel from mobile/UI ("CALLCENTER") to DB ("CallCenter")
    let channelFilter: any = {};
    if (channel) {
      channelFilter = {
        channel:
          channel.toUpperCase() === "CALLCENTER" ? "CallCenter" : channel,
      };
    }

    const rows = await prisma.order.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(status ? { status } : {}),
        ...channelFilter,
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        branch: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            product: {
              // 👇 include categoryId so mobile can know category
              select: { id: true, name: true, categoryId: true },
            },
            modifiers: {
              include: {
                modifierItem: {
                  select: { id: true, name: true, price: true },
                },
              },
            },
          },
        },
        payments: true,
      },
    });

    console.log("✅ GET /orders returning", rows.length, "rows");

    // 🔁 Override orderType for CallCenter in RESPONSE only
    const transformed = rows.map((o: any) => {
      // DB stores "CallCenter" for callcenter channel
      if (o.channel === "CallCenter") {
        return {
          ...o,
          orderType: "PICK_UP", // 👈 show PICK_UP for callcenter orders
        };
      }
      return o;
    });

    return res.json(transformed);
  } catch (err) {
    console.error("❌ GET /orders failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ------------------------------------------------------------------ */
/* POST /orders – create order (protected, now with modifiers)        */
/* ------------------------------------------------------------------ */

const OrderDto = z.object({
  branchId: z.string(),
  channel: z.enum(["POS", "CallCenter", "Aggregator"]).default("POS"),

  // ⭐ NEW: optional customerId (for CallCenter or POS creating orders)
  customerId: z.string().optional().nullable(),

  items: z.array(
    z.object({
      productId: z.string(),
      size: z.string().optional(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),

      // 🔥 modifiers per item
      modifiers: z
        .array(
          z.object({
            modifierItemId: z.string(),
            qty: z.number().int().positive().optional(), // default 1
            price: z.number().nonnegative().optional(), // optional override
          })
        )
        .optional(),
    })
  ),
  payments: z
    .array(
      z.object({
        method: z.string(),
        amount: z.number().nonnegative(),
        ref: z.string().optional(),
      })
    )
    .optional(),
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = OrderDto.parse(req.body);

    const vatRate = Number(process.env.DEFAULT_VAT_RATE ?? "0.15");

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0; // hook for later discounts

    const itemCreates: any[] = [];

    for (const line of parsed.items) {
      const base = line.qty * line.unitPrice;

      // --- modifiers for this line ---
      let modsSubtotal = 0;
      const modifierCreates: any[] = [];

      if (line.modifiers && line.modifiers.length) {
        for (const m of line.modifiers) {
          const mQty = m.qty ?? 1;
          const mPrice = m.price ?? 0; // or look up ModifierItem.price in DB
          const modLine = mQty * mPrice;

          modsSubtotal += modLine;

          modifierCreates.push({
            modifierItemId: m.modifierItemId,
            qty: mQty,
            price: mPrice,
          });
        }
      }

      const lineSubtotal = base + modsSubtotal;
      const lineTax = +(lineSubtotal * vatRate).toFixed(2);
      const lineTotal = lineSubtotal + lineTax;

      subtotal += lineSubtotal;
      taxTotal += lineTax;

      itemCreates.push({
        productId: line.productId,
        size: line.size,
        qty: line.qty,
        unitPrice: line.unitPrice,
        tax: lineTax,
        total: lineTotal,
        modifiers:
          modifierCreates.length > 0
            ? {
                create: modifierCreates,
              }
            : undefined,
      });
    }

    const netTotal = subtotal + taxTotal - discountTotal;

    const hasPayments = parsed.payments && parsed.payments.length > 0;

    // 🔸 status rules:
    //   - CallCenter  → PENDING (will be ACCEPT / DECLINE later)
    //   - others      → ACTIVE if not paid, CLOSED if paid
    const isCallCenter = parsed.channel === "CallCenter";
    const status = isCallCenter
      ? "PENDING"
      : hasPayments
      ? "CLOSED"
      : "ACTIVE";

    const order = await prisma.order.create({
      data: {
        branchId: parsed.branchId,
        channel: parsed.channel,
        orderNo: "SO-" + Date.now(),
        businessDate: new Date(),
        status,
        subtotal,
        taxTotal,
        discountTotal,
        netTotal,
        closedAt: hasPayments ? new Date() : null,

        // ⭐ NEW: save customerId if provided
        ...(parsed.customerId
          ? { customerId: parsed.customerId }
          : {}),

        items: {
          create: itemCreates,
        },

        payments: hasPayments
          ? {
              create: parsed.payments!.map((p) => ({
                method: p.method,
                amount: p.amount,
                ref: p.ref,
              })),
            }
          : undefined,
      },
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: { id: true, name: true, categoryId: true }, // 👈 here too
            },
            modifiers: {
              include: {
                modifierItem: {
                  select: { id: true, name: true, price: true },
                },
              },
            },
          },
        },
        payments: true,
      },
    });

    // 🔔 WebSocket: if this is a CallCenter order, notify via WS
    if (order.channel === "CallCenter") {
      broadcastCallcenterOrder(order);
    }

    // 🔔 Kafka: publish ORDER_CREATED event (no-op if Kafka disabled)
    await publishOrderEvent("ORDER_CREATED", order);

    // 🔔 Dashboard WS: notify dashboards to refresh
    broadcastDashboardTick({
      reason: "ORDER_CREATED",
      orderId: order.id,
      branchId: order.branchId,
      status: order.status,
    });

    return res.status(201).json(order);
  } catch (err: any) {
    console.error("❌ POST /orders failed:", err);
    if (err?.name === "ZodError") {
      return res
        .status(400)
        .json({ error: "validation_error", details: err.errors });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ------------------------------------------------------------------ */
/* GET /orders/:id – single order (for reopen, callcenter, etc.)      */
/* ------------------------------------------------------------------ */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              // 👇 IMPORTANT: send categoryId so mobile can pick category
              select: { id: true, name: true, categoryId: true },
            },
            modifiers: {
              include: {
                modifierItem: {
                  select: { id: true, name: true, price: true },
                },
              },
            },
          },
        },
        payments: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // 🔁 Override orderType for CallCenter in RESPONSE only
    const transformed =
      order.channel === "CallCenter"
        ? { ...order, orderType: "PICK_UP" }
        : order;

    return res.json(transformed);
  } catch (err: any) {
    console.error("GET /orders/:id ERROR", err);
    return res
      .status(500)
      .json({ error: "Failed to load order", details: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/* POST /orders/:id/close – close POS order                           */
/* ------------------------------------------------------------------ */

router.post("/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      vatRate,
      subtotalEx,
      vatAmount,
      total,
      orderType, // currently unused (no field in Order?)
      items = [],
      payments = [],

      // 👇 discount fields from POS / UI
      discountAmount,
      discount,

      // ⭐ NEW: customerId from POS UI
      customerId,
    } = req.body || {};

    const vatFraction =
      typeof vatRate === "number" && vatRate > 0 ? vatRate / 100 : 0;

    // ---------- NEW: compute discountTotal / kind / value ----------
    const discountTotalValue =
      typeof discountAmount === "number"
        ? discountAmount
        : discount && typeof discount.amount === "number"
        ? discount.amount
        : 0;

    let discountKindForDb: DiscountType | null = null;
    let discountValueForDb: Prisma.Decimal | null = null;

    if (discount && discount.kind && discount.value != null) {
      const kindUpper = String(discount.kind).toUpperCase();
      if (kindUpper === "PERCENT" || kindUpper === "PERCENTAGE") {
        discountKindForDb = DiscountType.PERCENTAGE;
      } else {
        // "AMOUNT" or anything else → FIXED
        discountKindForDb = DiscountType.FIXED;
      }
      discountValueForDb = new Prisma.Decimal(discount.value);
    }

    console.log("💸 /orders/:id/close discount debug", {
      discountAmount,
      discountFromObj: discount?.amount,
      discountTotalValue,
      discountKindForDb,
      discountValueForDb: discountValueForDb?.toString(),
      customerId, // ⭐ debug
    });

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: "CLOSED",
        taxTotal: vatAmount ?? 0,
        subtotal: subtotalEx ?? 0,
        netTotal: total ?? 0,
        // 🔸 do NOT touch channel here
        closedAt: new Date(),

        // ⬇ NEW: persist discount meta on close
        discountTotal: new Prisma.Decimal(discountTotalValue),
        discountKind: discountKindForDb,
        discountValue: discountValueForDb,

        // ⭐ NEW: attach / override customerId when closing (if provided)
        ...(customerId ? { customerId: String(customerId) } : {}),

        // 🔹 Replace all existing items with new ones from payload
        items: {
          deleteMany: {},
          create: items.map((it: any) => {
            const qty = Number(it.qty || 0);
            const unitPrice = Number(it.unitPrice || 0);
            const lineTotal = qty * unitPrice;

            let lineTax = 0;
            if (vatFraction > 0) {
              const exVat = lineTotal / (1 + vatFraction);
              lineTax = lineTotal - exVat;
            }

            return {
              productId: it.productId,
              size: it.sizeName ?? null,
              qty,
              unitPrice,
              tax: lineTax,
              total: lineTotal,
              modifiers:
                it.modifiers && it.modifiers.length > 0
                  ? {
                      create: it.modifiers.map((m: any) => ({
                        modifierItemId: m.modifierItemId ?? m.itemId,
                        price: m.price ?? 0,
                        qty: m.qty ?? 1,
                      })),
                    }
                  : undefined,
            };
          }),
        },

        // 🔹 Replace payments
        payments: {
          deleteMany: {},
          create: payments.map((p: any) => ({
            method: String(p.methodName ?? p.methodId ?? "UNKNOWN"),
            amount: Number(p.amount || 0),
          })),
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, categoryId: true }, // 👈 here
            },
            modifiers: {
              include: {
                modifierItem: {
                  select: { id: true, name: true, price: true },
                },
              },
            },
          },
        },
        payments: true,
      },
    });

    console.log("✅ /orders/:id/close updated order", {
      id: updated.id,
      orderNo: updated.orderNo,
      customerId: updated.customerId, // ⭐ debug
      discountTotal: updated.discountTotal.toString(),
      discountKind: updated.discountKind,
      discountValue: updated.discountValue?.toString(),
    });

    // Also apply the same override on close response
    const transformed =
      updated.channel === "CallCenter"
        ? { ...updated, orderType: "PICK_UP" }
        : updated;

    // 🔔 WebSocket: if it's a CallCenter order, broadcast updated status
    if (updated.channel === "CallCenter") {
      broadcastCallcenterOrder(updated);
    }

    // 🔔 Kafka: publish ORDER_CLOSED event
    await publishOrderEvent("ORDER_CLOSED", updated);

    // 🔔 Dashboard WS: notify dashboards
    broadcastDashboardTick({
      reason: "ORDER_CLOSED",
      orderId: updated.id,
      branchId: (updated as any).branchId,
      status: updated.status,
    });

    return res.json(transformed);
  } catch (err: any) {
    console.error("POST /orders/:id/close ERROR", err);
    return res
      .status(500)
      .json({ error: "Failed to close order", details: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/* POST /orders/:id/void – void order                                 */
/* ------------------------------------------------------------------ */

router.post("/:id/void", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        channel: true,
        branchId: true,
        createdAt: true,
        subtotal: true,
        taxTotal: true,
        discountTotal: true,
        netTotal: true,
        businessDate: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status === "CLOSED") {
      return res.status(400).json({ error: "Cannot void a CLOSED order" });
    }

    if (order.status === "VOID") {
      return res.status(400).json({ error: "Order is already voided" });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedById: req.user.id, // from requireAuth
      },
    });

    // 🔔 WebSocket: if it was a CallCenter order, broadcast void
    if (order.channel === "CallCenter") {
      // we can use original order info for branchId/createdAt + new status
      broadcastCallcenterOrder({
        ...order,
        status: "VOID",
      });
    }

    // 🔔 Kafka: publish ORDER_VOIDED event (using original + new status)
    await publishOrderEvent("ORDER_VOIDED", {
      ...order,
      status: "VOID",
    });

    // 🔔 Dashboard WS: notify dashboards
    broadcastDashboardTick({
      reason: "ORDER_VOIDED",
      orderId: updated.id,
      branchId: order.branchId,
      status: updated.status,
    });

    return res.json({ success: true, order: updated });
  } catch (err) {
    console.error("POST /orders/:id/void ERROR:", err);
    return res
      .status(500)
      .json({ error: "Failed to void order", details: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/* CALLCENTER: Accept / Decline                                       */
/* ------------------------------------------------------------------ */

// Accept → PENDING -> ACTIVE
router.post("/:id/callcenter-accept", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: "ACTIVE",
        // orderType stays as-is in DB; we override to PICK_UP in responses
      },
    });

    // apply override in response too
    const transformed =
      updated.channel === "CallCenter"
        ? { ...updated, orderType: "PICK_UP" }
        : updated;

    // 🔔 WebSocket: broadcast status change to mobile
    if (updated.channel === "CallCenter") {
      broadcastCallcenterOrder(updated);
    }

    // 🔔 Kafka: publish ORDER_ACCEPTED event
    await publishOrderEvent("ORDER_ACCEPTED", updated);

    // 🔔 Dashboard WS: notify dashboards
    broadcastDashboardTick({
      reason: "ORDER_ACCEPTED",
      orderId: updated.id,
      branchId: (updated as any).branchId,
      status: updated.status,
    });

    return res.json(transformed);
  } catch (err: any) {
    console.error("POST /orders/:id/callcenter-accept ERROR", err);
    return res.status(500).json({
      error: "Failed to accept order",
      details: String(err),
    });
  }
});

// Decline → PENDING -> DECLINED
router.post("/:id/callcenter-decline", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: "DECLINED",
        // declineReason: req.body.reason ?? null, // if you add this field
      },
    });

    // 🔔 WebSocket: broadcast status change to mobile
    if (updated.channel === "CallCenter") {
      broadcastCallcenterOrder(updated);
    }

    // 🔔 Kafka: publish ORDER_DECLINED event
    await publishOrderEvent("ORDER_DECLINED", updated);

    // 🔔 Dashboard WS: notify dashboards
    broadcastDashboardTick({
      reason: "ORDER_DECLINED",
      orderId: updated.id,
      branchId: (updated as any).branchId,
      status: updated.status,
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("POST /orders/:id/callcenter-decline ERROR", err);
    return res.status(500).json({
      error: "Failed to decline order",
      details: String(err),
    });
  }
});

export default router;
