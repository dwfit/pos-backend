// apps/api/src/routes/orders.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import { broadcastCallcenterOrder, broadcastDashboardTick } from "../ws";

// Prisma
import { Prisma, DiscountType, OrderChannel } from "@prisma/client";

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
      topic: "orders",
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

/* -------------------- helper: safe string -------------------- */
function s(v: any): string | null {
  if (v == null) return null;
  const out = String(v).trim();
  return out ? out : null;
}

/* -------------------- channel normalization -------------------- */
/**
 * IMPORTANT:
 * Prisma enum is only: POS | CALLCENTER
 * - We can ACCEPT legacy query/body values like "CallCenter"
 * - But we must always query/store ONLY valid enum values.
 */
function normalizeChannel(input?: any): OrderChannel {
  const raw = String(input ?? "POS").trim();
  const u = raw.toUpperCase();

  // accept legacy spelling from old clients
  if (u === "CALLCENTER" || raw === "CallCenter") return OrderChannel.CALLCENTER;

  return OrderChannel.POS;
}

function isCallCenterChannel(ch?: any) {
  // extra-safe (even though DB enum should only ever be POS/CALLCENTER)
  return (
    ch === OrderChannel.CALLCENTER ||
    ch === "CALLCENTER" ||
    ch === "CallCenter"
  );
}

/* ------------------------------------------------------------------ */
/* GET /orders – list orders with filters (PROTECTED + brand aware)   */
/* ------------------------------------------------------------------ */
/**
 * Optional query params:
 * - brandId ("ALL" or missing => all allowed brands)
 * - branchId
 * - date (YYYY-MM-DD)
 * - dateFrom/dateTo (YYYY-MM-DD)
 * - status
 * - channel (POS/CALLCENTER/CallCenter)
 */
router.get("/", requireAuth, async (req: any, res) => {
  try {
    const {
      brandId: qBrandId,
      branchId: qBranchId,
      date,
      dateFrom,
      dateTo,
      status,
      channel,
    } = req.query as {
      brandId?: string;
      branchId?: string;
      date?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      channel?: string;
    };

    const brandId = s(qBrandId);
    const branchId = s(qBranchId);

    console.log("🔎 GET /orders query:", req.query);

    // ------------------------------------------------------------
    // Date filters
    // ------------------------------------------------------------
    let dateFilter: any = {};

    if (date && date.trim() !== "") {
      const start = parseDay(date);
      if (start) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        dateFilter = {
          businessDate: {
            gte: start,
            lt: end,
          },
        };
      }
    } else if (dateFrom || dateTo) {
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

    // ------------------------------------------------------------
    // Channel filter (enum safe)
    // ------------------------------------------------------------
    let channelFilter: any = {};
    if (channel) {
      const norm = normalizeChannel(channel);
      channelFilter = { channel: norm };
    }

    // ------------------------------------------------------------
    // ✅ Brand filter + RBAC
    // req.user should have allowAllBrands / allowedBrandIds
    // ------------------------------------------------------------
    const user = req.user;

    const where: any = {
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
      ...channelFilter,
      ...dateFilter,
    };

    const wantsAllBrands = !brandId || brandId === "ALL";

    if (!user?.allowAllBrands) {
      const allowedIds: string[] = Array.isArray(user?.allowedBrandIds)
        ? user.allowedBrandIds
        : [];

      if (!allowedIds.length) {
        // user has no allowed brands => return empty
        return res.json([]);
      }

      if (wantsAllBrands) {
        where.brandId = { in: allowedIds };
      } else {
        if (!allowedIds.includes(brandId)) {
          // selected a brand they don't have access to
          return res.json([]);
        }
        where.brandId = brandId;
      }
    } else {
      // allowAllBrands === true
      if (!wantsAllBrands) {
        where.brandId = brandId;
      }
    }

    // (Optional) debug:
    console.log("🧾 GET /orders where:", JSON.stringify(where, null, 2));

    const rows = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, categoryId: true } },
            modifiers: {
              include: {
                modifierItem: { select: { id: true, name: true, price: true } },
              },
            },
          },
        },
        payments: true,
      },
    });

    console.log("✅ GET /orders returning", rows.length, "rows");

    const transformed = rows.map((o: any) => {
      // normalize response
      if (isCallCenterChannel(o.channel)) {
        return { ...o, channel: "CALLCENTER", orderType: "PICK_UP" };
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
/* POST /orders – create order (protected, with modifiers)            */
/* ------------------------------------------------------------------ */

const OrderDto = z.object({
  branchId: z.string(),

  // accept legacy + canonical, normalize later
  channel: z.enum(["POS", "CALLCENTER", "CallCenter"]).default("POS"),

  // brandId/deviceId required by your schema (Order has required brandId/deviceId)
  brandId: z.string().optional(),
  deviceId: z.string().optional(),

  customerId: z.string().optional().nullable(),

  items: z.array(
    z.object({
      productId: z.string(),
      size: z.string().optional(),
      qty: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      modifiers: z
        .array(
          z.object({
            modifierItemId: z.string(),
            qty: z.number().int().positive().optional(),
            price: z.number().nonnegative().optional(),
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

    const channelNorm = normalizeChannel(parsed.channel);

    const brandId = s(parsed.brandId);
    const deviceId = s(parsed.deviceId);

    if (!brandId) return res.status(400).json({ error: "brandId_required" });
    if (!deviceId) return res.status(400).json({ error: "deviceId_required" });

    const vatRate = Number(process.env.DEFAULT_VAT_RATE ?? "0.15");

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const itemCreates: any[] = [];

    for (const line of parsed.items) {
      const base = line.qty * line.unitPrice;

      let modsSubtotal = 0;
      const modifierCreates: any[] = [];

      if (line.modifiers && line.modifiers.length) {
        for (const m of line.modifiers) {
          const mQty = m.qty ?? 1;
          const mPrice = m.price ?? 0;
          const modLine = mQty * mPrice;

          modsSubtotal += modLine;

          modifierCreates.push({
            modifierItem: { connect: { id: m.modifierItemId } },
            qty: mQty,
            price: mPrice,
            brand: { connect: { id: brandId } },
            device: { connect: { id: deviceId } },
          });
        }
      }

      const lineSubtotal = base + modsSubtotal;
      const lineTax = +(lineSubtotal * vatRate).toFixed(2);
      const lineTotal = lineSubtotal + lineTax;

      subtotal += lineSubtotal;
      taxTotal += lineTax;

      const itemRow: any = {
        product: { connect: { id: line.productId } },
        size: line.size ?? null,
        qty: line.qty,
        unitPrice: new Prisma.Decimal(line.unitPrice),
        tax: new Prisma.Decimal(lineTax),
        total: new Prisma.Decimal(lineTotal),

        brand: { connect: { id: brandId } },
        device: { connect: { id: deviceId } },
      };

      if (modifierCreates.length > 0) {
        itemRow.modifiers = { create: modifierCreates };
      }

      itemCreates.push(itemRow);
    }

    const netTotal = subtotal + taxTotal - discountTotal;

    const hasPayments = parsed.payments && parsed.payments.length > 0;

    const isCallCenter = channelNorm === OrderChannel.CALLCENTER;
    const status = isCallCenter ? "PENDING" : hasPayments ? "CLOSED" : "ACTIVE";

    const order = await prisma.order.create({
      data: {
        branch: { connect: { id: parsed.branchId } },
        brand: { connect: { id: brandId } },
        device: { connect: { id: deviceId } },

        // ✅ store only valid enum
        channel: channelNorm,

        orderNo: "SO-" + Date.now(),
        businessDate: new Date(),
        status,

        subtotal: new Prisma.Decimal(subtotal),
        taxTotal: new Prisma.Decimal(taxTotal),
        discountTotal: new Prisma.Decimal(discountTotal),
        netTotal: new Prisma.Decimal(netTotal),

        closedAt: hasPayments ? new Date() : null,

        ...(parsed.customerId
          ? { customer: { connect: { id: parsed.customerId } } }
          : {}),

        items: { create: itemCreates },

        payments: hasPayments
          ? {
              create: parsed.payments!.map((p) => ({
                brand: { connect: { id: brandId } },
                device: { connect: { id: deviceId } },
                method: p.method,
                amount: new Prisma.Decimal(p.amount),
                ref: p.ref ?? null,
              })),
            }
          : undefined,
      },
      include: {
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, categoryId: true } },
            modifiers: {
              include: {
                modifierItem: { select: { id: true, name: true, price: true } },
              },
            },
          },
        },
        payments: true,
      },
    });

    if (isCallCenterChannel(order.channel)) {
      broadcastCallcenterOrder({
        ...order,
        channel: "CALLCENTER",
        orderType: "PICK_UP",
      });
    }

    await publishOrderEvent("ORDER_CREATED", order);

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
/* GET /orders/:id – single order                                     */
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
            product: { select: { id: true, name: true, categoryId: true } },
            modifiers: {
              include: {
                modifierItem: { select: { id: true, name: true, price: true } },
              },
            },
          },
        },
        payments: true,
      },
    });

    if (!order) return res.status(404).json({ error: "Order not found" });

    const transformed = isCallCenterChannel(order.channel)
      ? { ...order, channel: "CALLCENTER", orderType: "PICK_UP" }
      : order;

    return res.json(transformed);
  } catch (err: any) {
    console.error("GET /orders/:id ERROR", err);
    return res.status(500).json({
      error: "Failed to load order",
      details: String(err),
    });
  }
});

/* ------------------------------------------------------------------ */
/* POST /orders/:id/close – close order (POS + supports CALLCENTER)    */
/* ------------------------------------------------------------------ */

router.post("/:id/close", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      brandId: bodyBrandId,
      deviceId: bodyDeviceId,

      vatRate,
      subtotalEx,
      vatAmount,
      total,

      items = [],
      payments = [],

      discountAmount,
      discount,

      customerId,
    } = req.body || {};

    // ✅ load current order (so we always have brandId/branchId/deviceId)
    const existing = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        brandId: true,
        branchId: true,
        deviceId: true,
        channel: true,
        status: true,
      },
    });

    if (!existing) return res.status(404).json({ error: "Order not found" });

    // Prevent re-closing
    if (existing.status === "CLOSED") {
      return res.status(200).json({ ok: true, alreadyClosed: true });
    }

    const finalBrandId = s(bodyBrandId) || s(existing.brandId);
    const finalDeviceId = s(bodyDeviceId) || s(existing.deviceId);

    if (!finalBrandId) {
      return res.status(400).json({
        error: "brandId_required",
        details: "Missing brandId for closing order (order or payload).",
      });
    }
    if (!finalDeviceId) {
      return res.status(400).json({
        error: "deviceId_required",
        details: "Missing deviceId for closing order (order or payload).",
      });
    }

    const vatFraction =
      typeof vatRate === "number" && vatRate > 0 ? vatRate / 100 : 0;

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
      discountKindForDb =
        kindUpper === "PERCENT" || kindUpper === "PERCENTAGE"
          ? DiscountType.PERCENTAGE
          : DiscountType.FIXED;

      discountValueForDb = new Prisma.Decimal(discount.value);
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: "CLOSED",
        taxTotal: new Prisma.Decimal(vatAmount ?? 0),
        subtotal: new Prisma.Decimal(subtotalEx ?? 0),
        netTotal: new Prisma.Decimal(total ?? 0),
        closedAt: new Date(),

        // Keep relations consistent
        brand: { connect: { id: finalBrandId } },
        device: { connect: { id: finalDeviceId } },

        discountTotal: new Prisma.Decimal(discountTotalValue),
        discountKind: discountKindForDb,
        discountValue: discountValueForDb,

        ...(customerId
          ? { customer: { connect: { id: String(customerId) } } }
          : {}),

        // ✅ Replace items
        items: {
          deleteMany: {},
          create: (items || []).map((it: any) => {
            const qty = Number(it.qty || 0);
            const unitPrice = Number(it.unitPrice || 0);
            const lineTotal = qty * unitPrice;

            let lineTax = 0;
            if (vatFraction > 0) {
              const exVat = lineTotal / (1 + vatFraction);
              lineTax = lineTotal - exVat;
            }

            const row: any = {
              brand: { connect: { id: finalBrandId } },
              device: { connect: { id: finalDeviceId } },
              product: { connect: { id: String(it.productId) } },

              size: it.sizeName ?? it.size ?? null,
              qty,
              unitPrice: new Prisma.Decimal(unitPrice),
              tax: new Prisma.Decimal(lineTax),
              total: new Prisma.Decimal(lineTotal),
              notes: it.notes ?? null,
            };

            // Modifiers: accept multiple payload shapes
            const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
            if (mods.length > 0) {
              row.modifiers = {
                create: mods.map((m: any) => {
                  const modifierItemId =
                    m.modifierItemId ?? m.itemId ?? m.id ?? m.modifierId;

                  return {
                    brand: { connect: { id: finalBrandId } },
                    device: { connect: { id: finalDeviceId } },
                    modifierItem: { connect: { id: String(modifierItemId) } },
                    price: new Prisma.Decimal(m.price ?? 0),
                    qty: m.qty ?? 1,
                  };
                }),
              };
            }

            return row;
          }),
        },

        // ✅ Replace payments
        payments: {
          deleteMany: {},
          create: (payments || []).map((p: any) => {
            const methodName = String(p.methodName ?? p.method ?? "UNKNOWN");
            const amount = Number(p.amount ?? 0);

            const payRow: any = {
              brand: { connect: { id: finalBrandId } },
              device: { connect: { id: finalDeviceId } },
              method: methodName,
              amount: new Prisma.Decimal(amount),
              ref: p.ref ?? null,
            };

            // Optional link to PaymentMethod if you send methodId
            if (p.methodId) {
              payRow.paymentMethod = { connect: { id: String(p.methodId) } };
            }

            return payRow;
          }),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, categoryId: true } },
            modifiers: {
              include: {
                modifierItem: { select: { id: true, name: true, price: true } },
              },
            },
          },
        },
        payments: true,
      },
    });

    const transformed = isCallCenterChannel(updated.channel)
      ? { ...updated, channel: "CALLCENTER", orderType: "PICK_UP" }
      : updated;

    if (isCallCenterChannel(updated.channel)) {
      broadcastCallcenterOrder({
        ...updated,
        channel: "CALLCENTER",
        orderType: "PICK_UP",
      });
    }

    await publishOrderEvent("ORDER_CLOSED", updated);

    broadcastDashboardTick({
      reason: "ORDER_CLOSED",
      orderId: updated.id,
      branchId: (updated as any).branchId,
      status: updated.status,
    });

    return res.json(transformed);
  } catch (err: any) {
    console.error("POST /orders/:id/close ERROR", err);
    return res.status(500).json({
      error: "Failed to close order",
      details: String(err),
    });
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

    if (!order) return res.status(404).json({ error: "Order not found" });

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
        voidedById: req.user.id,
      },
    });

    if (isCallCenterChannel(order.channel)) {
      broadcastCallcenterOrder({
        ...order,
        channel: "CALLCENTER",
        status: "VOID",
        orderType: "PICK_UP",
      });
    }

    await publishOrderEvent("ORDER_VOIDED", { ...order, status: "VOID" });

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
      data: { status: "ACTIVE" },
    });

    const transformed = isCallCenterChannel(updated.channel)
      ? { ...updated, channel: "CALLCENTER", orderType: "PICK_UP" }
      : updated;

    if (isCallCenterChannel(updated.channel)) {
      broadcastCallcenterOrder({
        ...updated,
        channel: "CALLCENTER",
        orderType: "PICK_UP",
      });
    }

    await publishOrderEvent("ORDER_ACCEPTED", updated);

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
      data: { status: "DECLINED" },
    });

    if (isCallCenterChannel(updated.channel)) {
      broadcastCallcenterOrder({
        ...updated,
        channel: "CALLCENTER",
        orderType: "PICK_UP",
      });
    }

    await publishOrderEvent("ORDER_DECLINED", updated);

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
