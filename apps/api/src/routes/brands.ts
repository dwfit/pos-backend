import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /brands
 */
router.get("/", async (req, res) => {
  const simple = String(req.query.simple || "") === "1";
  const active = String(req.query.active || "") === "1";

  const where: any = {};
  if (active) where.isActive = true;

  const items = await prisma.brand.findMany({
    where,
    orderBy: { createdAt: "asc" },
    ...(simple
      ? { select: { id: true, code: true, name: true, isActive: true } }
      : { include: { organization: true } }),
  });

  res.json(items);
});


/**
 * POST /brands
 * ✅ Protected (create/update)
 */
router.post("/", requireAuth, async (req, res) => {
  const S = z.object({
    id: z.string().optional(),
    organizationId: z.string(),
    code: z.string().min(2),
    name: z.string().min(2),
    isActive: z.boolean().optional(),
  });

  const data = S.parse(req.body);

  const brand = data.id
    ? await prisma.brand.update({
        where: { id: data.id },
        data,
      })
    : await prisma.brand.create({
        data: {
          organizationId: data.organizationId,
          code: data.code,
          name: data.name,
          isActive: data.isActive ?? true,
        },
      });

  res.json(brand);
});

/**
 * GET /brands/:id
 * ✅ Public read (optional) – useful for view pages
 */
router.get("/:id", async (req, res) => {
  const id = String(req.params.id || "");
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: { organization: true },
  });
  if (!brand) return res.status(404).json({ message: "Brand not found" });
  res.json(brand);
});

export default router;
