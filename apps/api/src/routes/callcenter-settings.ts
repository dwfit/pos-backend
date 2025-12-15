// apps/api/src/routes/callcenter-settings.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router = Router();

/* -----------------------------------------------------
 * Helpers
 * ---------------------------------------------------*/

// string | null | undefined | ""  →  undefined
const nullableText = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null || v === "" ? undefined : v));

/* -----------------------------------------------------
 * Zod schema for Call Center settings
 * ---------------------------------------------------*/

const bodySchema = z.object({
  // e.g. "CallCenter"
  agents: nullableText,

  // stored as JSON string[]
  acceptedPaymentModes: z.array(z.string()).optional().default([]),

  // free text / CSV strings
  inactiveBranches: nullableText,
  menuGroup: nullableText,
  inactiveOrderTypes: nullableText,

  // toggles
  allowDiscounts: z.boolean().optional().default(true),
  allowCoupons: z.boolean().optional().default(false),
  allowEditingOrders: z.boolean().optional().default(false),
  allowVoidingActive: z.boolean().optional().default(false),
  allowReadAllCcOrders: z.boolean().optional().default(true),
  allowReadAllDcOrders: z.boolean().optional().default(true),
  allowPriceTags: z.boolean().optional().default(false),
});

/* -----------------------------------------------------
 * GET /callcenter-settings
 * ---------------------------------------------------*/

router.get("/", requireAuth, async (req, res) => {
  try {
    let settings = await prisma.posCallCenterSettings.findFirst();

    if (!settings) {
      // create default row on first access
      settings = await prisma.posCallCenterSettings.create({
        data: {
          agents: "CallCenter",
          acceptedPaymentModes: ["CARD_ON_DELIVERY", "CASH_ON_DELIVERY"],
          allowDiscounts: true,
          allowReadAllCcOrders: true,
          allowReadAllDcOrders: true,
        },
      });
    }

    const response = {
      ...settings,
      acceptedPaymentModes: (settings.acceptedPaymentModes || []) as string[],
    };

    res.json(response);
  } catch (err) {
    console.error("GET /callcenter-settings error", err);
    res.status(500).json({ message: "Failed to load settings" });
  }
});

/* -----------------------------------------------------
 * POST /callcenter-settings
 * ---------------------------------------------------*/

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = bodySchema.parse(req.body);

    const existing = await prisma.posCallCenterSettings.findFirst({
      select: { id: true },
    });

    const data = {
      // parsed.agents, inactiveBranches, menuGroup, inactiveOrderTypes, flags...
      ...parsed,
      acceptedPaymentModes: parsed.acceptedPaymentModes || [],
    };

    const settings = existing
      ? await prisma.posCallCenterSettings.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.posCallCenterSettings.create({ data });

    const response = {
      ...settings,
      acceptedPaymentModes: (settings.acceptedPaymentModes || []) as string[],
    };

    res.json(response);
  } catch (err: any) {
    console.error("POST /callcenter-settings error", err);
    if (err.name === "ZodError") {
      return res
        .status(400)
        .json({ message: "Invalid data", issues: err.issues });
    }
    res.status(500).json({ message: "Failed to save settings" });
  }
});

export default router;
