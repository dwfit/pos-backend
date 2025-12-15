// apps/api/src/routes/devices.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { compare, hash } from "../utils/crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { requireAuth, requireRole } from "../middleware/auth";
import { broadcastDeviceUpdate } from "../ws"; 

const router = Router();

/* ------------------------------- Helpers ------------------------------- */
function genSixDigit() {
  return Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
}
function slugifyCode(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);
}

/* -------- LEGACY app-device activation-key flow (namespaced) ----------- */
router.post(
  "/legacy/generate",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const S = z.object({
      branchId: z.string(),
      platform: z.enum(["android", "ios"]),
    });
    const { branchId, platform } = S.parse(req.body);
    const plain = "DK-" + Math.random().toString(36).slice(2, 10).toUpperCase();

    const d = await prisma.device.create({
      data: { branchId, platform, activationKeyHash: hash(plain) },
    });
    res.json({ deviceId: d.id, activationKey: plain });
  }
);

router.post("/legacy/activate", async (req, res) => {
  const S = z.object({
    deviceId: z.string().optional(),
    platform: z.enum(["android", "ios"]),
    key: z.string(),
    appVersion: z.string().optional(),
  });
  const { deviceId, platform, key, appVersion } = S.parse(req.body);

  const d = deviceId
    ? await prisma.device.findUnique({ where: { id: deviceId } })
    : await prisma.device.findFirst({
        where: { platform },
        orderBy: { createdAt: "desc" },
      });

  if (!d) return res.status(404).json({ error: "Device not found" });
  if (!d.activationKeyHash || !compare(key, d.activationKeyHash))
    return res.status(401).json({ error: "Invalid key" });

  const updated = await prisma.device.update({
    where: { id: d.id },
    data: { status: "active", appVersion, lastSeenAt: new Date() },
  });

  const token = jwt.sign(
    { deviceId: updated.id, role: "device" },
    config.jwtSecret,
    { expiresIn: "12h" }
  );
  res.json({ token, device: { id: updated.id, branchId: updated.branchId } });
});

/* ------------------------ POS Devices CRUD + activation ----------------- */
const TypeVals = ["CASHIER", "KDS", "NOTIFIER", "DISPLAY", "SUB_CASHIER"] as const;
const StatusVals = ["USED", "NOT_USED"] as const;

const CreatePosDevice = z.object({
  type: z.enum(TypeVals),
  name: z.string().min(1),
  reference: z.string().min(1),
  branchId: z.string().optional(),
  branchName: z.string().optional(),
});

const ListQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  type: z.enum(TypeVals).optional(),
  status: z.enum(StatusVals).optional(),
  receivesOnlineOrders: z.union([z.string(), z.boolean()]).optional(),
});

const UpdatePosDevice = z.object({
  name: z.string().min(1).optional(),
  reference: z.string().min(1).optional(),
  type: z.enum(TypeVals).optional(),
  status: z.enum(StatusVals).optional(),
  branchId: z.string().nullable().optional(),
  branchName: z.string().optional(),
});

const StatusBody = z.object({ status: z.enum(StatusVals) });

/* ----------------------- ONLINE devices (before :id!) ------------------- */
router.get("/online", async (_req, res) => {
  try {
    // Return only CASHIER devices that are currently USED (active on POS).
    const rows = await prisma.posDevice.findMany({
      where: {
        type: "CASHIER",
        status: "USED", // ensure only in-use cashiers appear
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    // Shape expected by web UI
    const devices = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type, // 👈 included now
      status: r.status, // 👈 included now
      receivesOnlineOrders: true, // 👈 surface as true for call center sending
      branch: r.branch,
    }));

    res.json(devices);
  } catch (err: any) {
    console.error("GET /devices/online failed:", err);
    res
      .status(500)
      .json({ error: "devices_online_failed", message: err?.message });
  }
});

/* --------------------------------- List --------------------------------- */
router.get("/", async (req, res) => {
  // Fallback: ?receivesOnlineOrders=true → list from legacy Device table
  const roRaw = (req.query.receivesOnlineOrders ?? "")
    .toString()
    .toLowerCase();
  if (roRaw === "true") {
    try {
      const devices = await prisma.device.findMany({
        where: { receivesOnlineOrders: true },
        select: {
          id: true,
          name: true,
          receivesOnlineOrders: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: [{ name: "asc" }],
      });
      return res.json(devices);
    } catch (err) {
      console.error("GET /devices?receivesOnlineOrders=true error:", err);
      return res.status(500).json({ error: "Failed to list devices" });
    }
  }

  const q = ListQuery.safeParse(req.query);
  if (!q.success)
    return res
      .status(400)
      .json({ error: "invalid_query", detail: q.error.flatten() });
  const { page, pageSize, search, type, status } = q.data;

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (search?.trim()) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { reference: { contains: search, mode: "insensitive" } },
      { deviceCode: { contains: search, mode: "insensitive" } },
      { branch: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.posDevice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        deviceCode: true,
        name: true,
        reference: true,
        status: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        activationCode: true,
        activationCodeGeneratedAt: true,
        lastSeenAt: true,
        appVersion: true,
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.posDevice.count({ where }),
  ]);

  res.json({
    items: rows.map((d) => ({
      id: d.id,
      name: d.name,
      reference: d.reference ?? d.deviceCode,
      status: d.status,
      type: d.type,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      activationCode: d.activationCode,
      activationCodeGeneratedAt: d.activationCodeGeneratedAt,
      lastSeenAt: d.lastSeenAt,
      appVersion: d.appVersion,
      branch: d.branch,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/* -------------------------------- Create -------------------------------- */
router.post("/", async (req, res) => {
  const body = CreatePosDevice.safeParse(req.body);
  if (!body.success)
    return res
      .status(400)
      .json({ error: "invalid_body", detail: body.error.flatten() });

  const { type, name, reference } = body.data;
  let { branchId, branchName } = body.data;

  try {
    if (!branchId && branchName?.trim()) {
      const existing = await prisma.branch.findFirst({
        where: { name: branchName.trim() },
        select: { id: true },
      });
      branchId = existing
        ? existing.id
        : (
            await prisma.branch.create({
              data: {
                code: slugifyCode(branchName),
                name: branchName,
                isActive: true,
                tz: "Asia/Riyadh",
              },
              select: { id: true },
            })
          ).id;
    }

    const deviceCode =
      slugifyCode(reference || name || "device") ||
      `device-${Math.random().toString(36).slice(2, 8)}`;

    const created = await prisma.posDevice.create({
      data: {
        deviceCode,
        name,
        reference,
        type,
        status: "NOT_USED",
        branchId: branchId ?? undefined,
      },
      select: {
        id: true,
        deviceCode: true,
        name: true,
        reference: true,
        status: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        activationCode: true,
        activationCodeGeneratedAt: true,
        lastSeenAt: true,
        appVersion: true,
        branch: { select: { id: true, name: true } },
      },
    });

    const response = {
      id: created.id,
      name: created.name,
      reference: created.reference ?? created.deviceCode,
      status: created.status,
      type: created.type,
      branch: created.branch,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      activationCode: created.activationCode,
      activationCodeGeneratedAt: created.activationCodeGeneratedAt,
      lastSeenAt: created.lastSeenAt,
      appVersion: created.appVersion,
      deviceCode: created.deviceCode,
    };

    // 🔔 WS: broadcast new device
    broadcastDeviceUpdate({ ...response, branchId: created.branch?.id });

    res.status(201).json(response);
  } catch (e: any) {
    if (e?.code === "P2002")
      return res.status(409).json({ error: "reference_unique_violation" });
    console.error("posDevice create failed", e);
    res
      .status(500)
      .json({ error: "device_create_failed", detail: e?.message });
  }
});

/* --------------------------------- Read --------------------------------- */
router.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    const d = await prisma.posDevice.findUnique({
      where: { id },
      select: {
        id: true,
        deviceCode: true,
        name: true,
        reference: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        activationCode: true,
        activationCodeGeneratedAt: true,
        lastSeenAt: true,
        appVersion: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!d) return res.status(404).json({ error: "not_found" });

    res.json({
      id: d.id,
      name: d.name,
      reference: d.reference ?? d.deviceCode,
      type: d.type,
      status: d.status,
      branch: d.branch,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      activationCode: d.activationCode,
      activationCodeGeneratedAt: d.activationCodeGeneratedAt,
      lastSeenAt: d.lastSeenAt,
      appVersion: d.appVersion,
      deviceCode: d.deviceCode,
    });
  } catch (err: any) {
    console.error("GET /devices/:id failed", err);
    res
      .status(500)
      .json({ error: "device_detail_failed", message: err?.message });
  }
});

/* -------------------------------- Update -------------------------------- */
router.patch("/:id", async (req, res) => {
  const id = String(req.params.id);
  const body = UpdatePosDevice.safeParse(req.body);
  if (!body.success)
    return res
      .status(400)
      .json({ error: "invalid_body", detail: body.error.flatten() });

  const data = body.data;
  try {
    let branchId: string | null | undefined = data.branchId ?? undefined;
    if (!branchId && data.branchName?.trim()) {
      const found = await prisma.branch.findFirst({
        where: { name: data.branchName.trim() },
        select: { id: true },
      });
      branchId = found
        ? found.id
        : (
            await prisma.branch.create({
              data: {
                code: slugifyCode(data.branchName),
                name: data.branchName,
                isActive: true,
                tz: "Asia/Riyadh",
              },
              select: { id: true },
            })
          ).id;
    }

    const updated = await prisma.posDevice.update({
      where: { id },
      data: {
        name: data.name,
        reference: data.reference,
        type: data.type,
        status: data.status,
        branchId: data.branchId === null ? null : branchId,
      },
      select: {
        id: true,
        deviceCode: true,
        name: true,
        reference: true,
        status: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        activationCode: true,
        activationCodeGeneratedAt: true,
        lastSeenAt: true,
        appVersion: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    });

    const response = {
      id: updated.id,
      name: updated.name,
      reference: updated.reference ?? updated.deviceCode,
      status: updated.status,
      type: updated.type,
      branch: updated.branch,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      activationCode: updated.activationCode,
      activationCodeGeneratedAt: updated.activationCodeGeneratedAt,
      lastSeenAt: updated.lastSeenAt,
      appVersion: updated.appVersion,
      deviceCode: updated.deviceCode,
    };

    // 🔔 WS: broadcast updated device
    broadcastDeviceUpdate({ ...response, branchId: updated.branchId });

    res.json(response);
  } catch (err: any) {
    console.error("PATCH /devices/:id failed", err);
    res
      .status(500)
      .json({ error: "device_update_failed", message: err?.message });
  }
});

/* ------------------------------ Quick status ----------------------------- */
router.post("/:id/status", async (req, res) => {
  const id = String(req.params.id);
  const b = StatusBody.safeParse(req.body);
  if (!b.success)
    return res
      .status(400)
      .json({ error: "invalid_body", detail: b.error.flatten() });

  try {
    const d = await prisma.posDevice.update({
      where: { id },
      data: { status: b.data.status },
      select: {
        id: true,
        deviceCode: true,
        name: true,
        reference: true,
        status: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        activationCode: true,
        activationCodeGeneratedAt: true,
        lastSeenAt: true,
        appVersion: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    });

    const response = {
      id: d.id,
      name: d.name,
      reference: d.reference ?? d.deviceCode,
      status: d.status,
      type: d.type,
      branch: d.branch,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      activationCode: d.activationCode,
      activationCodeGeneratedAt: d.activationCodeGeneratedAt,
      lastSeenAt: d.lastSeenAt,
      appVersion: d.appVersion,
      deviceCode: d.deviceCode,
    };

    // 🔔 WS: status change
    broadcastDeviceUpdate({ ...response, branchId: d.branchId });

    res.json(response);
  } catch (err: any) {
    console.error("POST /devices/:id/status failed", err);
    res
      .status(500)
      .json({ error: "device_status_failed", message: err?.message });
  }
});

/* --------------------------------- Delete -------------------------------- */
router.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    // Fetch before delete so we know branch/device info
    const existing = await prisma.posDevice.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        reference: true,
        deviceCode: true,
        type: true,
        status: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    });

    await prisma.posDevice.delete({ where: { id } });

    if (existing) {
      // 🔔 WS: notify that device was removed
      broadcastDeviceUpdate({
        id: existing.id,
        name: existing.name,
        reference: existing.reference ?? existing.deviceCode,
        status: existing.status,
        type: existing.type,
        branchId: existing.branchId,
        branch: existing.branch,
        deleted: true,
        event: "deleted",
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /devices/:id failed", err);
    res
      .status(500)
      .json({ error: "device_delete_failed", message: err?.message });
  }
});

/* --------------------------- POS activation flow ------------------------- */
router.post("/:id/activation-code", async (req, res) => {
  const id = String(req.params.id);
  try {
    const code = genSixDigit();
    const d = await prisma.posDevice.update({
      where: { id },
      data: {
        activationCode: code,
        activationCodeGeneratedAt: new Date(),
        status: "NOT_USED",
      },
      select: {
        id: true,
        name: true,
        reference: true,
        type: true,
        status: true,
        activationCode: true,
        activationCodeGeneratedAt: true,
        updatedAt: true,
        lastSeenAt: true,
        appVersion: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
    });

    // 🔔 WS: activation code regenerated
    broadcastDeviceUpdate({
      id: d.id,
      name: d.name,
      reference: d.reference ?? undefined,
      status: d.status,
      type: d.type,
      branchId: d.branchId,
      branch: d.branch,
      activationCode: d.activationCode,
      activationCodeGeneratedAt: d.activationCodeGeneratedAt,
      event: "activation_code",
    });

    res.json(d);
  } catch (e: any) {
    console.error("POST /devices/:id/activation-code failed", e);
    res
      .status(500)
      .json({ error: "activation_code_failed", message: e?.message });
  }
});

router.post("/pos/activate", async (req, res) => {
  const S = z.object({
    code: z.string().regex(/^\d{6}$/),
    platform: z.enum(["android", "ios"]).optional(),
    appVersion: z.string().optional(),
  });
  const { code, platform, appVersion } = S.parse(req.body);

  try {
    const d = await prisma.posDevice.findFirst({
      where: { activationCode: code },
      select: { id: true, branchId: true },
    });
    if (!d) return res.status(401).json({ error: "invalid_code" });

    const updated = await prisma.posDevice.update({
      where: { id: d.id },
      data: {
        status: "USED",
        activationCode: null,
        activationCodeGeneratedAt: null,
        platform,
        appVersion,
        lastSeenAt: new Date(),
      },
      select: { id: true, branchId: true, status: true, updatedAt: true },
    });

    // 🔔 WS: device activated
    broadcastDeviceUpdate({
      id: updated.id,
      status: updated.status,
      branchId: updated.branchId,
      event: "activated",
      updatedAt: updated.updatedAt,
    });

    const token = jwt.sign(
      { deviceId: updated.id, role: "device" },
      config.jwtSecret,
      { expiresIn: "12h" }
    );
    res.json({
      token,
      device: {
        id: updated.id,
        branchId: updated.branchId,
        status: updated.status,
      },
      updatedAt: updated.updatedAt,
    });
  } catch (e: any) {
    console.error("POST /devices/pos/activate failed", e);
    res
      .status(500)
      .json({ error: "device_activate_failed", message: e?.message });
  }
});

router.post("/:id/deactivate", async (req, res) => {
  const id = String(req.params.id);
  try {
    const code = genSixDigit();
    const d = await prisma.posDevice.update({
      where: { id },
      data: {
        status: "NOT_USED",
        activationCode: code,
        activationCodeGeneratedAt: new Date(),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        activationCode: true,
        activationCodeGeneratedAt: true,
        updatedAt: true,
        branchId: true,
      },
    });

    // 🔔 WS: device deactivated
    broadcastDeviceUpdate({
      id: d.id,
      status: d.status,
      branchId: d.branchId,
      event: "deactivated",
      activationCode: d.activationCode,
      activationCodeGeneratedAt: d.activationCodeGeneratedAt,
      updatedAt: d.updatedAt,
    });

    res.json(d);
  } catch (e: any) {
    console.error("POST /devices/:id/deactivate failed", e);
    res
      .status(500)
      .json({ error: "device_deactivate_failed", message: e?.message });
  }
});

router.post("/:id/heartbeat", async (req, res) => {
  const id = String(req.params.id);
  const S = z.object({ appVersion: z.string().optional() });
  const { appVersion } = S.parse(req.body ?? {});
  try {
    const d = await prisma.posDevice.update({
      where: { id },
      data: { lastSeenAt: new Date(), appVersion: appVersion ?? undefined },
      select: { status: true, updatedAt: true },
    });

    // (No WS broadcast here to avoid spamming on heartbeat)

    res.json({
      deactivate: d.status === "NOT_USED",
      status: d.status,
      updatedAt: d.updatedAt,
    });
  } catch (e: any) {
    console.error("POST /devices/:id/heartbeat failed", e);
    res
      .status(500)
      .json({ error: "heartbeat_failed", message: e?.message });
  }
});

router.post("/:id/force-sync", async (req, res) => {
  const id = String(req.params.id);
  const P = z.object({
    mode: z.enum(["push_pull", "push", "pull"]).default("push_pull"),
  });
  const { mode } = P.parse(req.body ?? {});

  try {
    const d = await prisma.posDevice.findUnique({
      where: { id },
      select: { id: true, branchId: true },
    });
    if (!d) return res.status(404).json({ error: "not_found" });

    await prisma.posDevice.update({
      where: { id },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    // (Optional: could emit a specific WS event for force-sync if you want)

    res.status(202).json({
      accepted: true,
      mode,
      message:
        "Force sync requested. Device should pull/apply settings and push data.",
    });
  } catch (e: any) {
    console.error("POST /devices/:id/force-sync failed", e);
    res
      .status(500)
      .json({ error: "force_sync_failed", message: e?.message });
  }
});

router.post("/sync", async (req, res) => {
  const P = z.object({
    id: z.string(),
    mode: z.enum(["push_pull", "push", "pull"]).default("push_pull"),
  });
  const { id, mode } = P.parse(req.body ?? {});
  try {
    const d = await prisma.posDevice.findUnique({
      where: { id },
      select: { id: true, branchId: true },
    });
    if (!d) return res.status(404).json({ error: "not_found" });

    await prisma.posDevice.update({
      where: { id },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    // (Optional: WS push here too if needed)

    res.status(202).json({
      accepted: true,
      mode,
      message: "Force sync requested (generic).",
    });
  } catch (e: any) {
    console.error("POST /devices/sync failed", e);
    res.status(500).json({ error: "sync_failed", message: e?.message });
  }
});

export default router;
