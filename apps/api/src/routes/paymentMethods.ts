import { Router } from "express";
import { prisma } from "../db";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";

const router = Router();

/* ------------------------ helpers ------------------------ */

async function generatePaymentMethodCode() {
  const last = await prisma.paymentMethod.findFirst({
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });

  if (!last || !last.code) return "pm-001";

  const num = parseInt(last.code.replace("pm-", "")) || 0;
  const next = String(num + 1).padStart(3, "0");
  return `pm-${next}`;
}

async function logPaymentMethodAction(
  paymentMethodId: string,
  action: string,
  userId: string | undefined,
  before: any = null,
  after: any = null
) {
  await prisma.paymentMethodAudit.create({
    data: {
      paymentMethodId,
      action,
      userId,
      before,
      after,
    },
  });
}

/* ------------------------ payment types ------------------------ */
/* READ: no auth */

router.get("/types", async (_req, res) => {
  const types = await prisma.paymentType.findMany({
    orderBy: { name: "asc" },
  });
  res.json(types);
});

/* WRITE: make public for now (no auth) */

router.post("/types", async (req, res) => {
  const body = z.object({ name: z.string().min(1) }).parse(req.body);
  const type = await prisma.paymentType.create({
    data: { name: body.name },
  });
  res.status(201).json(type);
});

router.patch("/types/:id", async (req, res) => {
  const { id } = req.params;
  const body = z.object({ name: z.string().min(1) }).parse(req.body);

  const updated = await prisma.paymentType.update({
    where: { id },
    data: { name: body.name },
  });

  res.json(updated);
});

/* ------------------------ payment methods list ------------------------ */
/* READ: no auth */

router.get("/", async (req: any, res) => {
  const status = req.query.status as string | undefined;
  const search = (req.query.search as string | undefined)?.trim() || "";

  const where: any = {};

  if (status === "active") {
    where.isActive = true;
    where.deletedAt = null;
  } else if (status === "inactive") {
    where.isActive = false;
    where.deletedAt = null;
  } else if (status === "deleted") {
    where.deletedAt = { not: null };
  } else {
    // all: include non-deleted only by default
    where.deletedAt = null;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { nameLocalized: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }

  const methods = await prisma.paymentMethod.findMany({
    where,
    include: { type: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  res.json(methods);
});

/* ------------------------ create ------------------------ */
/* WRITE: no auth for now */

router.post("/", async (req: any, res) => {
  const userId = req.user?.id as string | undefined;

  const body = z
    .object({
      name: z.string().min(1),
      nameLocalized: z.string().optional().nullable(),
      typeId: z.string().min(1),
      code: z.string().optional().nullable(), // will be overwritten
      autoOpenCashDrawer: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);

  const autoCode = await generatePaymentMethodCode();

  const maxOrder = await prisma.paymentMethod.aggregate({
    _max: { sortOrder: true },
  });

  const method = await prisma.paymentMethod.create({
    data: {
      name: body.name,
      nameLocalized: body.nameLocalized || null,
      typeId: body.typeId,
      code: autoCode,
      autoOpenCashDrawer: body.autoOpenCashDrawer ?? false,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      isActive: body.isActive ?? true,
    },
    include: { type: true },
  });

  await logPaymentMethodAction(method.id, "CREATE", userId, null, method);

  res.status(201).json(method);
});

/* ------------------------ update ------------------------ */

router.patch("/:id", async (req: any, res) => {
  const { id } = req.params;
  const userId = req.user?.id as string | undefined;

  const body = z
    .object({
      name: z.string().min(1),
      nameLocalized: z.string().optional().nullable(),
      typeId: z.string().min(1),
      autoOpenCashDrawer: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);

  const before = await prisma.paymentMethod.findUnique({
    where: { id },
    include: { type: true },
  });

  if (!before) return res.status(404).json({ message: "Not found" });

  const method = await prisma.paymentMethod.update({
    where: { id },
    data: {
      name: body.name,
      nameLocalized: body.nameLocalized || null,
      typeId: body.typeId,
      autoOpenCashDrawer: body.autoOpenCashDrawer ?? before.autoOpenCashDrawer,
      isActive: body.isActive ?? before.isActive,
    },
    include: { type: true },
  });

  await logPaymentMethodAction(id, "UPDATE", userId, before, method);

  res.json(method);
});

/* ------------------------ toggle active ------------------------ */

router.patch("/:id/toggle", async (req: any, res) => {
  const { id } = req.params;
  const userId = req.user?.id as string | undefined;

  const before = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ message: "Not found" });

  const method = await prisma.paymentMethod.update({
    where: { id },
    data: { isActive: !before.isActive },
    include: { type: true },
  });

  await logPaymentMethodAction(id, "TOGGLE_ACTIVE", userId, before, method);

  res.json(method);
});

/* ------------------------ soft delete & restore ------------------------ */

router.delete("/:id", async (req: any, res) => {
  const { id } = req.params;
  const userId = req.user?.id as string | undefined;

  const before = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ message: "Not found" });

  const method = await prisma.paymentMethod.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
    include: { type: true },
  });

  await logPaymentMethodAction(id, "DELETE", userId, before, method);

  res.json(method);
});

router.patch("/:id/restore", async (req: any, res) => {
  const { id } = req.params;
  const userId = req.user?.id as string | undefined;

  const before = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ message: "Not found" });

  const method = await prisma.paymentMethod.update({
    where: { id },
    data: {
      deletedAt: null,
      isActive: true,
    },
    include: { type: true },
  });

  await logPaymentMethodAction(id, "RESTORE", userId, before, method);

  res.json(method);
});

/* ------------------------ reorder ------------------------ */

router.post("/reorder", async (req: any, res) => {
  const userId = req.user?.id as string | undefined;

  const body = z.object({ ids: z.array(z.string()) }).parse(req.body);

  const updates = body.ids.map((id, index) =>
    prisma.paymentMethod.update({
      where: { id },
      data: { sortOrder: index + 1 },
    })
  );

  await prisma.$transaction(updates);

  await logPaymentMethodAction(body.ids[0], "REORDER", userId, null, {
    ids: body.ids,
  });

  res.json({ ok: true });
});

/* ------------------------ audit log list ------------------------ */
/* READ: no auth */

router.get("/:id/audit", async (req, res) => {
  const { id } = req.params;

  const logs = await prisma.paymentMethodAudit.findMany({
    where: { paymentMethodId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  res.json(logs);
});

export default router;
