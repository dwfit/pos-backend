// apps/api/src/routes/receipt-settings.ts
import { Router } from "express";
import { prisma } from "../db";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";

const router = Router();

/* ---------------------- zod schema ---------------------- */

const bodySchema = z.object({
  // allow normal string or empty (for relative paths like "/uploads/receipt/xxx.png")
  logoUrl: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v === "" ? undefined : v)),

  printLanguage: z.enum(["MAIN_LOCALIZED", "MAIN_ONLY", "LOCALIZED_ONLY"]),
  mainLanguage: z.string(),
  localizedLanguage: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v === "" ? undefined : v)),

  receiptHeader: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v === "" ? undefined : v)),
  receiptFooter: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v === "" ? undefined : v)),
  invoiceTitle: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(v => (v === "" ? undefined : v)),

  showOrderNumber: z.boolean().optional().default(true),
  showCalories: z.boolean().optional().default(false),
  showSubtotal: z.boolean().optional().default(true),
  showRounding: z.boolean().optional().default(false),
  showCloserUsername: z.boolean().optional().default(false),
  showCreatorUsername: z.boolean().optional().default(false),
  showCheckNumber: z.boolean().optional().default(true),
  hideFreeModifierOptions: z.boolean().optional().default(false),
  printCustomerPhoneInPickup: z.boolean().optional().default(false),
});


/* ------------------------- GET -------------------------- */
/* Returns the single settings row (or default values)      */

router.get("/", requireAuth, async (req, res) => {
  try {
    let settings = await prisma.posReceiptSettings.findFirst();

    if (!settings) {
      // create a default row on first access
      settings = await prisma.posReceiptSettings.create({
        data: {
          printLanguage: "MAIN_LOCALIZED",
          mainLanguage: "en",
          localizedLanguage: "ar",
          invoiceTitle: "Simplified Tax Invoice",
          showOrderNumber: true,
          showSubtotal: true,
          showCheckNumber: true,
        },
      });
    }

    return res.json(settings);
  } catch (err) {
    console.error("GET /receipt-settings error", err);
    return res.status(500).json({ message: "Failed to load receipt settings" });
  }
});

/* ------------------------- POST ------------------------- */
/* Upsert: update existing row or create one if missing     */

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = bodySchema.parse(req.body);

    const existing = await prisma.posReceiptSettings.findFirst({
      select: { id: true },
    });

    let settings;
    if (existing) {
      settings = await prisma.posReceiptSettings.update({
        where: { id: existing.id },
        data: parsed,
      });
    } else {
      settings = await prisma.posReceiptSettings.create({
        data: parsed,
      });
    }

    return res.json(settings);
  } catch (err: any) {
    console.error("POST /receipt-settings error", err);
    if (err.name === "ZodError") {
      return res.status(400).json({ message: "Invalid data", issues: err.issues });
    }
    return res.status(500).json({ message: "Failed to save receipt settings" });
  }
});

export default router;
