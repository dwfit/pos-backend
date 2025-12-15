import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router = Router();

const bodySchema = z.object({
  sortingMethod: z.string().optional().or(z.literal("")).transform(v => v || "MENU_CATEGORY"),
  showDefaultModifiersOnKds: z.boolean().optional().default(false),
});

router.get("/", requireAuth, async (req, res) => {
  try {
    let settings = await prisma.posKitchenSettings.findFirst();
    if (!settings) {
      settings = await prisma.posKitchenSettings.create({
        data: { sortingMethod: "MENU_CATEGORY" },
      });
    }
    res.json(settings);
  } catch (err) {
    console.error("GET /kitchen-settings error", err);
    res.status(500).json({ message: "Failed to load settings" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = bodySchema.parse(req.body);
    const existing = await prisma.posKitchenSettings.findFirst({ select: { id: true } });

    const settings = existing
      ? await prisma.posKitchenSettings.update({ where: { id: existing.id }, data: parsed })
      : await prisma.posKitchenSettings.create({ data: parsed });

    res.json(settings);
  } catch (err: any) {
    console.error("POST /kitchen-settings error", err);
    if (err.name === "ZodError") {
      return res.status(400).json({ message: "Invalid data", issues: err.issues });
    }
    res.status(500).json({ message: "Failed to save settings" });
  }
});

export default router;
