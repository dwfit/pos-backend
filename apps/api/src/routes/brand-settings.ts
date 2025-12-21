import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router = Router();

const receiptSchema = z
  .object({
    logoUrl: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),

    printLanguage: z
      .enum(["MAIN_LOCALIZED", "MAIN_ONLY", "LOCALIZED_ONLY"])
      .optional(),

    mainLanguage: z.string().optional(),

    localizedLanguage: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),

    receiptHeader: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),

    receiptFooter: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),

    invoiceTitle: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v)),

    showOrderNumber: z.boolean().optional(),
    showCalories: z.boolean().optional(),
    showSubtotal: z.boolean().optional(),
    showRounding: z.boolean().optional(),
    showCloserUsername: z.boolean().optional(),
    showCreatorUsername: z.boolean().optional(),
    showCheckNumber: z.boolean().optional(),
    hideFreeModifierOptions: z.boolean().optional(),
    printCustomerPhoneInPickup: z.boolean().optional(),
  })
  .strip(); // ✅ strips unknown keys like agents

/* ----------------------------- GET ----------------------------- */
router.get("/:brandId", requireAuth, async (req, res) => {
  const brandId = String(req.params.brandId || "");
  try {
    const settings = await prisma.brandSettings.findUnique({
      where: { brandId },
    });
    return res.json(settings ?? {});
  } catch (err) {
    console.error("GET /brand-settings/:brandId", err);
    return res.status(500).json({ message: "Failed to load brand settings" });
  }
});

/* ----------------------------- POST (UPSERT) ----------------------------- */
router.post("/:brandId", requireAuth, async (req, res) => {
  const brandId = String(req.params.brandId || "");

  try {
    // ✅ Ensure Brand exists to avoid FK error P2003
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true },
    });

    if (!brand) {
      return res.status(404).json({
        message: "Brand not found (invalid brandId)",
        brandId,
      });
    }

    const data = receiptSchema.parse(req.body);

    const settings = await prisma.brandSettings.upsert({
      where: { brandId },
      update: data,
      create: { brandId, ...data },
    });

    return res.json(settings);
  } catch (err: any) {
    console.error("POST /brand-settings/:brandId", err);

    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Invalid data",
        issues: err.issues,
      });
    }

    // Prisma FK error (just in case)
    if (err?.code === "P2003") {
      return res.status(400).json({
        message: "Invalid brandId (foreign key constraint)",
        brandId,
      });
    }

    return res.status(500).json({ message: "Failed to save brand settings" });
  }
});

export default router;
