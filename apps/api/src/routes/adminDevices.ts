import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth"; // make sure this exists

const router = Router();

// GET /admin/devices?branchId=...&brandId=...
router.get("/", requireAuth, async (req: any, res) => {
  const { branchId, brandId } = req.query;

  const devices = await prisma.device.findMany({
    where: {
      ...(branchId ? { branchId: String(branchId) } : {}),
      ...(brandId ? { brandId: String(brandId) } : {}),
      isActive: true,
    },
    include: {
      printerConfig: true,
    },
    orderBy: { code: "asc" },
  });

  res.json(devices);
});

// POST /admin/devices
router.post("/", requireAuth, async (req: any, res) => {
  const {
    branchId,
    brandId,
    code,
    name,
    kind,
    ipAddress,
    printerModel,
    printerCategory,
    enabledOrderTypes,
  } = req.body;

  const device = await prisma.device.create({
    data: {
      branchId,
      brandId,
      code,
      name,
      kind,
      ipAddress,
      printerConfig:
        kind === "PRINTER"
          ? {
              create: {
                model: printerModel,
                category: printerCategory,
                enabledOrderTypes: enabledOrderTypes ?? [],
              },
            }
          : undefined,
    },
    include: { printerConfig: true },
  });

  res.status(201).json(device);
});

// PUT /admin/devices/:id
router.put("/:id", requireAuth, async (req: any, res) => {
  const { id } = req.params;
  const {
    name,
    ipAddress,
    printerModel,
    printerCategory,
    enabledOrderTypes,
  } = req.body;

  const device = await prisma.device.update({
    where: { id },
    data: {
      name,
      ipAddress,
      printerConfig: {
        upsert: {
          create: {
            model: printerModel,
            category: printerCategory,
            enabledOrderTypes: enabledOrderTypes ?? [],
          },
          update: {
            model: printerModel,
            category: printerCategory,
            enabledOrderTypes: enabledOrderTypes ?? [],
          },
        },
      },
    },
    include: { printerConfig: true },
  });

  res.json(device);
});

// DELETE /admin/devices/:id
router.delete("/:id", requireAuth, async (req: any, res) => {
  const { id } = req.params;

  await prisma.printerConfig.deleteMany({ where: { deviceId: id } });
  await prisma.device.delete({ where: { id } });

  res.status(204).send();
});

export default router;
