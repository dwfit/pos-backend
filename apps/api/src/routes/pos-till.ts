import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { Decimal } from "@prisma/client/runtime/library";

const router = Router();


/* ---------------- HELPERS ---------------- */

function getContext(req: any) {
  const userId = req.user?.sub;

  const branchId =
    req.user?.branchId ||
    req.body?.branchId ||
    req.user?.posBranchId ||
    null;

  const brandId =
    req.user?.brandId ||
    req.body?.brandId ||
    null;

  const deviceId =
    req.user?.deviceId ||
    req.body?.deviceId ||
    null;

  if (!userId || !branchId) {
    throw new Error("MISSING_CONTEXT");
  }

  return { userId, branchId, brandId, deviceId };
}



/* ---------------------------------------------------
      POST  /pos/clock-in
--------------------------------------------------- */

router.post("/clock-in", requireAuth, async (req: any, res) => {
  try {
    const { userId, branchId, brandId: brandFromCtx, deviceId } = getContext(req);
    let brandId = brandFromCtx;

    // ... brand resolving ...

    let shift = await prisma.shift.findFirst({
      where: { userId, branchId, status: "OPEN" },
    });

    if (!shift) {
      shift = await prisma.shift.create({
        data: { userId, branchId, brandId, deviceId },
      });
    }

    res.json({
      shiftId: shift.id,
      status: shift.status,
      clockInAt: shift.clockInAt,
    });
  } catch (e: any) {
    console.error("clock-in error", e);
    if (e.message === "MISSING_CONTEXT") {
      return res.status(400).json({ message: "Missing user/branch/brand" });
    }
    res.status(500).json({ message: "Clock-in failed" });
  }
});
/* -------POST  /pos/till/checkout ----- */
router.post("/till/open", requireAuth, async (req: any, res) => {
  try {
    const { userId, branchId, brandId, deviceId } = getContext(req);
    const openingCash = new Decimal(req.body?.openingCash ?? 0);

    let shift = await prisma.shift.findFirst({
      where: { userId, branchId, status: "OPEN" },
    });
    if (!shift) {
      shift = await prisma.shift.create({
        data: { userId, branchId, brandId, deviceId },
      });
    }

    await prisma.tillSession.updateMany({
      where: { shiftId: shift.id, status: "OPEN" },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    const till = await prisma.tillSession.create({
      data: {
        shiftId: shift.id,
        branchId,
        brandId,
        deviceId,
        openingCash,
      },
    });

    res.json({
      tillSessionId: till.id,
      status: till.status,
      openingCash: till.openingCash,
      openedAt: till.openedAt,
    });
  } catch (e: any) {
    console.error("clock-out error", e);
    if (e.message === "MISSING_CONTEXT") {
      return res.status(400).json({ message: "Missing user/branch/brand" });
    }
    res.status(500).json({ message: "Clock-out failed" });
  }
});

/* -------POST  /pos/till/open ----- */

router.post("/till/open", requireAuth, async (req: any, res) => {
  try {
    const { userId, branchId, brandId, deviceId } = getContext(req);
    const openingCash = new Decimal(req.body?.openingCash ?? 0);

    // ensure user has an open shift
    let shift = await prisma.shift.findFirst({
      where: { userId, branchId, status: "OPEN" },
    });
    if (!shift) {
      shift = await prisma.shift.create({
        data: { userId, branchId, brandId, deviceId },
      });
    }

    // close any old till sessions for this shift
    await prisma.tillSession.updateMany({
      where: { shiftId: shift.id, status: "OPEN" },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    // create new till session
    const till = await prisma.tillSession.create({
      data: {
        shiftId: shift.id,
        branchId,
        brandId,
        deviceId,
        openingCash,
      },
    });

    res.json({
      tillSessionId: till.id,
      status: till.status,
      openingCash: till.openingCash,
      openedAt: till.openedAt,
    });

  } catch (e: any) {
    console.error("till/open error", e);
    res.status(500).json({ message: "Failed to open till" });
  }
});


/* ---------------------------------------------------
      POST  /pos/till/close
--------------------------------------------------- */

router.post("/till/close", requireAuth, async (req: any, res) => {
  try {
    const { userId, branchId } = getContext(req);

    const closingCash = new Decimal(req.body?.closingCash ?? 0);

    // find latest open till for user+branch
    let till = await prisma.tillSession.findFirst({
      where: {
        status: "OPEN",
        shift: { userId, branchId, status: "OPEN" },
      },
      orderBy: { openedAt: "desc" },
    });

    if (!till) {
      return res.status(400).json({ message: "No open till session" });
    }

    till = await prisma.tillSession.update({
      where: { id: till.id },
      data: {
        status: "CLOSED",
        closingCash,
        closedAt: new Date(),
      },
    });

    res.json({
      tillSessionId: till.id,
      status: till.status,
      closedAt: till.closedAt,
      closingCash: till.closingCash,
    });

  } catch (e: any) {
    console.error("till/close error", e);
    res.status(500).json({ message: "Failed to close till" });
  }
});
/* ================================
   POST /pos/clock-out
   ================================ */
router.post("/clock-out", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.sub;

    const branchId =
      req.user?.branchId ||
      req.body?.branchId ||
      req.user?.posBranchId ||
      null;

    if (!userId || !branchId) {
      return res.status(400).json({ message: "Missing user/branch" });
    }

    // 1️⃣ Check if any till session still open
    const openTill = await prisma.tillSession.findFirst({
      where: {
        status: "OPEN",
        shift: {
          userId,
          branchId,
          status: "OPEN",
        },
      },
    });

    if (openTill) {
      return res.status(400).json({
        message: "Till is still open. Please close till before clocking out.",
      });
    }

    // 2️⃣ Find the latest open shift
    let shift = await prisma.shift.findFirst({
      where: {
        userId,
        branchId,
        status: "OPEN",
      },
      orderBy: { clockInAt: "desc" },
    });

    if (!shift) {
      return res.status(400).json({
        message: "No open shift to clock out.",
      });
    }

    // 3️⃣ Close it
    shift = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: "CLOSED",
        clockOutAt: new Date(),
      },
    });

    return res.json({
      shiftId: shift.id,
      status: shift.status,
      clockOutAt: shift.clockOutAt,
    });
  } catch (err) {
    console.error("clock-out error", err);
    return res.status(500).json({ message: "Clock-out failed" });
  }
});


/* ---------------------------------------------------
      GET  /pos/till/status
--------------------------------------------------- */

router.get("/till/status", requireAuth, async (req: any, res) => {
  try {
    const { userId, branchId } = getContext(req);

    const till = await prisma.tillSession.findFirst({
      where: {
        status: "OPEN",
        shift: { userId, branchId, status: "OPEN" },
      },
      orderBy: { openedAt: "desc" },
      include: { shift: true },
    });

    if (!till) {
      return res.json({ tillOpen: false });
    }

    res.json({
      tillOpen: true,
      tillSessionId: till.id,
      openingCash: till.openingCash,
      openedAt: till.openedAt,
      shiftId: till.shiftId,
      userId: till.shift.userId,
    });

  } catch (e: any) {
    console.error("till/status error", e);
    res.status(500).json({ message: "Failed to get till status" });
  }
});

export default router;
