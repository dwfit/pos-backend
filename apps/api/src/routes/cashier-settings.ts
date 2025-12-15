// apps/api/src/routes/cashier-settings.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router = Router();

/* ------------------- helpers ------------------- */

// string | null | undefined | ""  →  undefined
const nullableText = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === "" ? undefined : v));

/* -------------------- schema ------------------- */

const bodySchema = z.object({
  // text fields that may come as null / empty
  presetTenderedAmounts: nullableText,
  tenderedAmountCurrencies: nullableText,
  predefinedTipPercentages: nullableText,

  uploadOrdersDelayMinutes: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(0),

  inactiveUsersLogoutMinutes: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(30),

  returnMode: z
    .enum(["LIMITED", "NOT_ALLOWED", "UNLIMITED"])
    .optional()
    .default("LIMITED"),

  // can be null if returnMode != LIMITED
  limitedReturnPeriodMinutes: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .nullable(),

  requireOrderTagsForOrders: nullableText,

  roundingMethod: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null || v === "" ? "NONE" : v)),

  enableTips: z.boolean().optional().default(false),
  discountsRequireCustomerInfo: z.boolean().optional().default(false),
  voidRequiresCustomerInfo: z.boolean().optional().default(false),
  requireTableGuestForDineIn: z.boolean().optional().default(false),
  alwaysAskVoidReasons: z.boolean().optional().default(false),
  autoSendToKitchenAfterFullPayment: z.boolean().optional().default(true),
  autoDataSyncAtStartOfDay: z.boolean().optional().default(false),
  autoPrintProductMix: z.boolean().optional().default(true),
  autoPrintTillReports: z.boolean().optional().default(false),
  forceInventoryCountBeforeEndOfDay: z.boolean().optional().default(false),
  autoCloseKioskOrders: z.boolean().optional().default(false),
  preventSellingOutOfStock: z.boolean().optional().default(false),
  printPaymentReceiptsForActiveOrders: z.boolean().optional().default(false),
  singleTillMode: z.boolean().optional().default(false),
  requireCustomerInfoBeforeClosing: z.boolean().optional().default(false),
});

/* ---------------- GET /cashier-settings ---------------- */

router.get("/", requireAuth, async (req, res) => {
  try {
    let settings = await prisma.posCashierAppSettings.findFirst();

    if (!settings) {
      // create default row
      settings = await prisma.posCashierAppSettings.create({
        data: {
          uploadOrdersDelayMinutes: 0,
          inactiveUsersLogoutMinutes: 30,
          returnMode: "LIMITED",
          limitedReturnPeriodMinutes: 21600,
          autoSendToKitchenAfterFullPayment: true,
          autoPrintProductMix: true,
        },
      });
    }

    res.json(settings);
  } catch (err) {
    console.error("GET /cashier-settings error", err);
    res.status(500).json({ message: "Failed to load settings" });
  }
});

/* ---------------- POST /cashier-settings --------------- */

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = bodySchema.parse(req.body);

    const existing = await prisma.posCashierAppSettings.findFirst({
      select: { id: true },
    });

    // if returnMode != LIMITED → ignore limitedReturnPeriodMinutes
    const data = {
      ...parsed,
      limitedReturnPeriodMinutes:
        parsed.returnMode === "LIMITED"
          ? parsed.limitedReturnPeriodMinutes ?? 0
          : null,
    };

    const settings = existing
      ? await prisma.posCashierAppSettings.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.posCashierAppSettings.create({ data });

    res.json(settings);
  } catch (err: any) {
    console.error("POST /cashier-settings error", err);
    if (err.name === "ZodError") {
      return res
        .status(400)
        .json({ message: "Invalid data", issues: err.issues });
    }
    res.status(500).json({ message: "Failed to save settings" });
  }
});

export default router;
