// apps/api/src/ws.ts
import { Server } from "socket.io";
import type http from "http";

let io: Server | null = null;

/**
 * Initialize WebSocket server and attach listeners.
 */
export function initWebSocket(server: http.Server) {
  // avoid re-initializing if already created
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: "*", // TODO: tighten in production
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 WS client connected:", socket.id);

    /* ------------------ POS device registration ------------------ */
    socket.on("registerDevice", (payload: any) => {
      try {
        const { deviceId, branchId } = payload || {};
        console.log("📲 registerDevice:", { deviceId, branchId });

        if (branchId) {
          const room = `branch:${branchId}`;
          socket.join(room);
          // store data for debugging / future
          (socket.data as any).branchId = branchId;
          (socket.data as any).deviceId = deviceId;
          console.log(`👥 socket ${socket.id} joined room ${room}`);
        }
      } catch (err) {
        console.error("registerDevice error", err);
      }
    });

    /* ------------------ DASHBOARD registration ------------------- */
    socket.on("registerDashboard", () => {
      try {
        socket.join("dashboards");
        console.log(`📊 Dashboard client joined: ${socket.id}`);
      } catch (err) {
        console.error("registerDashboard error", err);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("🔌 WS client disconnected:", socket.id, reason);
    });
  });

  console.log("✅ WebSocket server initialized");

  return io;
}

/* ------------------------------------------------------------------ */
/* Basic accessor                                                      */
/* ------------------------------------------------------------------ */

export function getIo() {
  return io;
}

/* ------------------------------------------------------------------ */
/* Callcenter broadcast helper (existing usage)                        */
/* ------------------------------------------------------------------ */

/**
 * For callcenter orders (used from orders.ts)
 */
export function broadcastCallcenterOrder(order: any) {
  if (!io) return;
  try {
    const branchRoom = order.branchId ? `branch:${order.branchId}` : null;

    console.log("📢 WS broadcastCallcenterOrder:", {
      orderId: order.id,
      status: order.status,
      branchRoom,
    });

    // To all dashboards & devices
    io.emit("callcenterOrder", order);

    // If you want branch-specific:
    if (branchRoom) {
      io.to(branchRoom).emit("callcenterOrder", order);
    }
  } catch (err) {
    console.error("broadcastCallcenterOrder error", err);
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard broadcast helper (existing)                               */
/* ------------------------------------------------------------------ */

/**
 * Emits a "dashboardTick" event to all connected dashboards.
 * Frontend should re-fetch dashboard data when this fires.
 */
export function broadcastDashboardTick(payload: any = {}) {
  if (!io) return;
  try {
    io.to("dashboards").emit("dashboardTick", {
      ts: new Date().toISOString(),
      ...payload,
    });
    console.log("📊 WS dashboardTick sent:", payload);
  } catch (err) {
    console.error("broadcastDashboardTick error", err);
  }
}

/* ------------------------------------------------------------------ */
/* NEW: Device broadcast helper                                       */
/* ------------------------------------------------------------------ */

type DeviceEvent = "created" | "updated" | "deleted";

interface DeviceUpdatePayload {
  event?: DeviceEvent;
  device?: any;
  branchId?: string | null;
}

/**
 * Flexible helper so it works with multiple call styles:
 *
 * 1) Object style (recommended):
 *    broadcastDeviceUpdate({
 *      event: "created",
 *      device,
 *      branchId: device.branchId,
 *    });
 *
 * 2) Positional style:
 *    broadcastDeviceUpdate("created", device, device.branchId);
 */
export function broadcastDeviceUpdate(
  arg1: DeviceEvent | DeviceUpdatePayload,
  arg2?: any,
  arg3?: string | null
) {
  if (!io) return;

  let event: DeviceEvent = "updated";
  let device: any;
  let branchId: string | null | undefined;

  // Case 1: object payload
  if (typeof arg1 === "object" && arg1 !== null) {
    const payload = arg1 as DeviceUpdatePayload;
    event = (payload.event as DeviceEvent) || "updated";
    device = payload.device;
    branchId =
      payload.branchId ??
      (payload.device && (payload.device as any).branchId) ??
      null;
  }
  // Case 2: ("created", device, branchId)
  else if (typeof arg1 === "string") {
    event = arg1 as DeviceEvent;
    device = arg2;
    branchId = arg3 ?? (arg2 && (arg2 as any).branchId) ?? null;
  } else {
    console.warn("broadcastDeviceUpdate called with invalid arguments");
    return;
  }

  if (!device) {
    console.warn("broadcastDeviceUpdate: missing device");
    return;
  }

  const message = {
    type: "device",
    event,
    device,
  };

  const room = branchId ? `branch:${branchId}` : null;

  if (room) {
    console.log(`📡 WS devices:updated → room ${room}`, {
      event,
      deviceId: device.id,
    });
    io.to(room).emit("devices:updated", message);
  }

  // Also send to everyone (dashboards, etc.)
  console.log("📡 WS devices:updated → ALL", {
    event,
    deviceId: device.id,
  });
  io.emit("devices:updated", message);
}
