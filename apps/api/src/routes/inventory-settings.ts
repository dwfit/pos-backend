// apps/api/src/routes/inventory-settings.ts
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
  logoUrl: nullableText,
  header: nullableText,
  footer: nullableText,
  restrictToAvailableQuantities: z.boolean().optional().default(false),
});

/* --------------- GET /inventory-settings --------------- */

router.get("/", requireAuth, async (req, res) => {
  try {
    let settings = await prisma.posInventorySettings.findFirst();

    if (!settings) {
      settings = await prisma.posInventorySettings.create({
        data: {
          restrictToAvailableQuantities: false,
        },
      });
    }

    res.json(settings);
  } catch (err) {
    console.error("GET /inventory-settings error", err);
    res.status(500).json({ message: "Failed to load settings" });
  }
});

/* --------------- POST /inventory-settings -------------- */

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = bodySchema.parse(req.body);

    const existing = await prisma.posInventorySettings.findFirst({
      select: { id: true },
    });

    const data = {
      ...parsed,
    };

    const settings = existing
      ? await prisma.posInventorySettings.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.posInventorySettings.create({ data });

    res.json(settings);
  } catch (err: any) {
    console.error("POST /inventory-settings error", err);
    if (err.name === "ZodError") {
      return res
        .status(400)
        .json({ message: "Invalid data", issues: err.issues });
    }
    res.status(500).json({ message: "Failed to save settings" });
  }
});

export default router;
