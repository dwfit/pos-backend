// apps/api/src/routes/deviceSettings.ts
import { Router } from "express";
import { prisma } from "../db";
import { z } from "zod";
import { broadcastDeviceUpdate } from "../ws";

const router = Router();

// The payload from your UI (edit to taste)
const SettingsSchema = z.object({
  // optional id for generic endpoint
  id: z.string().or(z.number()).optional(),

  callNumberStart: z.string().nullable().optional(),
  callNumberReset: z.string().nullable().optional(),

  defaultOrderType: z.string().nullable().optional(), // "NONE" | "DINE_IN" | ...
  disabledOrderTypes: z.array(z.string()).optional(),
  kitchenPrintLanguage: z.string().nullable().optional(), // "EN" | "AR"

  autoApplyOrderTags: z.array(z.string()).optional(),
  assignedTables: z.array(z.string()).optional(),
  defaultPriceTag: z.string().nullable().optional(),

  sendEodReportTo: z.string().nullable().optional(),
  sendShiftReportTo: z.string().nullable().optional(),
  sendTillReportTo: z.string().nullable().optional(),

  autoPair: z.boolean().optional(),
  enableBarcodeScanners: z.boolean().optional(),
  autoAcceptOnline: z.boolean().optional(),
  printOnlineInfo: z.boolean().optional(),
  autoSendAheadToKitchen: z.boolean().optional(),
  disableAutoReceiptPrint: z.boolean().optional(),
  useCallNumberFromMaster: z.boolean().optional(),
  printDrawerOps: z.boolean().optional(),
  forceSelectPriceTag: z.boolean().optional(),
  forceSelectSeat: z.boolean().optional(),
});

/* ---------------------- helper: upsert + WS notify ---------------------- */

async function upsert(deviceId: string, data: any) {
  return prisma.deviceSetting.upsert({
    where: { deviceId },
    update: { data },
    create: { deviceId, data },
  });
}

// Notify branch listeners that this device's settings changed
async function notifyDeviceSettingsChanged(deviceId: string) {
  try {
    const dev = await prisma.posDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, branchId: true },
    });

    // If posDevice not found, still emit something minimal
    broadcastDeviceUpdate({
      id: dev?.id ?? deviceId,
      branchId: dev?.branchId,
      event: "settings_updated",
    });
  } catch (err) {
    console.error("notifyDeviceSettingsChanged error:", err);
  }
}

/* --------------------------- Routes ------------------------------------- */

// GET /devices/:id/settings
router.get("/devices/:id/settings", async (req, res) => {
  try {
    const deviceId = req.params.id;
    const row = await prisma.deviceSetting.findUnique({ where: { deviceId } });
    return res.json(row?.data ?? {}); // return plain settings object
  } catch (e: any) {
    console.error("GET settings error:", e);
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

// PUT /devices/:id/settings  (upsert)
router.put("/devices/:id/settings", async (req, res) => {
  try {
    const deviceId = req.params.id;
    const parsed = SettingsSchema.parse(req.body);
    const saved = await upsert(deviceId, parsed);

    // 🔔 WS: notify about settings change
    await notifyDeviceSettingsChanged(deviceId);

    return res.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (e: any) {
    console.error("PUT settings error:", e);
    return res.status(400).json({ error: e.message || "Invalid payload" });
  }
});

// PATCH /devices/:id/settings (merge)
router.patch("/devices/:id/settings", async (req, res) => {
  try {
    const deviceId = req.params.id;
    const existing = await prisma.deviceSetting.findUnique({
      where: { deviceId },
    });
    const current = (existing?.data ?? {}) as Record<string, unknown>;
    const incoming = SettingsSchema.partial().parse(req.body);
    const merged = { ...current, ...incoming };
    const saved = await upsert(deviceId, merged);

    // 🔔 WS: notify about settings change
    await notifyDeviceSettingsChanged(deviceId);

    return res.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (e: any) {
    console.error("PATCH settings error:", e);
    return res.status(400).json({ error: e.message || "Invalid payload" });
  }
});

// Optional generic endpoint your UI tries last: POST /devices/settings  (expects { id, ... })
router.post("/devices/settings", async (req, res) => {
  try {
    const parsed = SettingsSchema.extend({
      id: SettingsSchema.shape.id.required(),
    }).parse(req.body);
    const deviceId = String(parsed.id);
    const { id, ...rest } = parsed;
    const saved = await upsert(deviceId, rest);

    // 🔔 WS: notify about settings change
    await notifyDeviceSettingsChanged(deviceId);

    return res.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (e: any) {
    console.error("POST generic settings error:", e);
    return res.status(400).json({ error: e.message || "Invalid payload" });
  }
});

export default router;
