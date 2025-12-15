// apps/api/src/routes/branches.ts
import { Router } from "express";
import { prisma } from "../db";
import { z } from "zod";

const router = Router();

/* ---------- helpers ---------- */
async function generateUniqueBranchCode() {
  const count = await prisma.branch.count();
  return "B" + String(count + 1).padStart(2, "0");
}
function nil(v: any) {
  return v === "" ? null : v;
}
function pickDefined<T extends object>(obj: T) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
async function resolveBranchId(idOrCode: string) {
  const b = await prisma.branch.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode }, { reference: idOrCode }] },
    select: { id: true },
  });
  return b?.id ?? null;
}

/* ---------- list (with filters) ---------- */
router.get("/", async (req, res) => {
  const simple = String(req.query.simple || "") === "1";

  // ✅ SIMPLE MODE for things like discounts UI
  if (simple) {
    try {
      const branches = await prisma.branch.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          reference: true,
          // no isActive here – Branch model doesn't have that field
        },
      });

      return res.json(
        branches.map(b => ({
          id: b.id,
          code: b.code,
          name: b.name,
          reference: b.reference,
        }))
      );
    } catch (err) {
      console.error("GET /branches?simple=1 error:", err);
      return res.status(500).json({ error: "Failed to load branches" });
    }
  }

  // 🔽 full mode (pagination + filters)
  const page = Math.max(parseInt(String(req.query.page || "1")), 1);
  const pageSize = Math.min(
    Math.max(parseInt(String(req.query.pageSize || "50")), 1),
    200
  );

  const {
    name,
    reference,
    taxGroup,
    code,
    city,
    tags, // comma-separated (optional)
    createdFrom,
    createdTo,
  } = req.query as Record<string, string | undefined>;

  const where: any = { AND: [] as any[] };
  const ci = (s: string) => ({ contains: s, mode: "insensitive" as const });

  if (name) where.AND.push({ name: ci(name) });
  if (reference) where.AND.push({ reference: ci(reference) });
  if (taxGroup) where.AND.push({ taxGroup: ci(taxGroup) });
  if (code) where.AND.push({ code: ci(code) });
  if (city) where.AND.push({ city: ci(city) });

  if (createdFrom) {
    const dt = new Date(createdFrom);
    if (!isNaN(dt.getTime())) where.AND.push({ createdAt: { gte: dt } });
  }
  if (createdTo) {
    const dt = new Date(createdTo);
    if (!isNaN(dt.getTime())) {
      dt.setHours(23, 59, 59, 999);
      where.AND.push({ createdAt: { lte: dt } });
    }
  }

  // Optional tags relation filter (adapt to your schema or remove)
  if (tags) {
    const list = tags
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (list.length) {
      where.AND.push({
        tags: { some: { name: { in: list, mode: "insensitive" } } },
      });
    }
  }

  if (!where.AND.length) delete where.AND;

  const [items, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        code: true,
        name: true,
        reference: true,
        taxGroup: true,
        city: true,
        createdAt: true,
      },
    }),
    prisma.branch.count({ where }),
  ]);

  res.json({
    data: items.map(b => ({
      id: b.id,
      code: b.code,
      name: b.name,
      reference: b.reference,
      taxGroup: b.taxGroup,
      city: b.city ?? null,
      createdAt: new Date(b.createdAt).toLocaleString(),
    })),
    total,
    page,
    pageSize,
  });
});

/* ---------- create ---------- */
const CreateBranch = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  nameLocalized: z.string().optional().nullable(),
  reference: z.string().optional(),
  taxGroup: z.string().optional().nullable(),
  branchTaxRegistrationName: z.string().optional().nullable(),
  branchTaxNumber: z.string().optional().nullable(),
  openingFrom: z.string().optional().nullable(),
  openingTo: z.string().optional().nullable(),
  inventoryEndOfDay: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  streetName: z.string().optional().nullable(),
  buildingNumber: z.string().optional().nullable(),
  additionalNumber: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  crNumber: z.string().optional().nullable(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  displayApp: z.boolean().optional().nullable(),
  receiptHeader: z.string().optional().nullable(),
  receiptFooter: z.string().optional().nullable(),
});

router.post("/", async (req, res) => {
  const parsed = CreateBranch.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const data = parsed.data;

  try {
    const result = await prisma.$transaction(async tx => {
      const code =
        (data.code && data.code.trim()) || (await generateUniqueBranchCode());
      const reference = (data.reference && data.reference.trim()) || code;

      const created = await tx.branch.create({
        data: {
          code,
          name: data.name,
          nameLocalized: data.nameLocalized ?? null,
          reference,
          taxGroup: data.taxGroup ?? null,
          branchTaxRegistrationName: data.branchTaxRegistrationName ?? null,
          branchTaxNumber: data.branchTaxNumber ?? null,
          openingFrom: data.openingFrom ?? null,
          openingTo: data.openingTo ?? null,
          inventoryEndOfDay: data.inventoryEndOfDay ?? null,
          phone: data.phone ?? null,
          address: data.address ?? null,
          streetName: data.streetName ?? null,
          buildingNumber: data.buildingNumber ?? null,
          additionalNumber: data.additionalNumber ?? null,
          city: data.city ?? null,
          district: data.district ?? null,
          postalCode: data.postalCode ?? null,
          crNumber: data.crNumber ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          displayApp: !!data.displayApp,
          receiptHeader: data.receiptHeader ?? null,
          receiptFooter: data.receiptFooter ?? null,
        },
        select: {
          id: true,
          code: true,
          name: true,
          reference: true,
          taxGroup: true,
          createdAt: true,
        },
      });

      // 🔗 Auto-attach all discounts that are marked as "applyAllBranches"
      const globalDiscounts = await tx.discount.findMany({
        where: {
          isDeleted: false,
          applyAllBranches: true,
        },
        select: { id: true },
      });

      if (globalDiscounts.length) {
        await tx.discountBranch.createMany({
          data: globalDiscounts.map(d => ({
            discountId: d.id,
            branchId: created.id,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    res.status(201).json({
      id: result.id,
      code: result.code,
      name: result.name,
      reference: result.reference,
      taxGroup: result.taxGroup,
      createdAt: new Date(result.createdAt).toLocaleString(),
    });
  } catch (err) {
    console.error("POST /branches error:", err);
    return res.status(500).json({ error: "Failed to create branch" });
  }
});

/* ---------- meta: distinct tax groups (place BEFORE :idOrCode) ---------- */
router.get("/tax-groups", async (_req, res) => {
  try {
    const taxGroups = await prisma.branch.findMany({
      where: { taxGroup: { not: null } },
      select: { taxGroup: true },
      distinct: ["taxGroup"],
      orderBy: { taxGroup: "asc" },
    });
    res.json({
      data: taxGroups
        .map(t => t.taxGroup)
        .filter((t): t is string => !!t && t.trim() !== ""),
    });
  } catch (err) {
    console.error("GET /branches/tax-groups error:", err);
    res.status(500).json({ error: "Failed to load tax groups" });
  }
});

/* ---------- show (by id OR code OR reference) ---------- */
router.get("/:idOrCode", async (req, res) => {
  const p = String(req.params.idOrCode);
  try {
    const branch = await prisma.branch.findFirst({
      where: { OR: [{ id: p }, { code: p }, { reference: p }] },
      select: {
        id: true,
        code: true,
        name: true,
        nameLocalized: true,
        reference: true,
        taxGroup: true,
        openingFrom: true,
        openingTo: true,
        inventoryEndOfDay: true,
        branchTaxNumber: true,
        branchTaxRegistrationName: true,
        phone: true,
        address: true,
        city: true,
        district: true,
        postalCode: true,
        tz: true,
        // no isActive field in your model
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const [posDevices, devices, userLinks] = await Promise.all([
      prisma.posDevice.findMany({
        where: { branchId: branch.id },
        select: { id: true, name: true, createdAt: true, lastSeenAt: true },
      }),
      prisma.device.findMany({
        where: { branchId: branch.id },
        select: {
          id: true,
          platform: true,
          appVersion: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
      prisma.userBranch.findMany({
        where: { branchId: branch.id },
        select: {
          assignedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const users = userLinks.map(u => ({
      id: u.user.id,
      name: u.user.name ?? "—",
      email: u.user.email ?? "—",
      employeeNo: "—",
      phone: "—",
      assignedAt: u.assignedAt,
    }));

    const assignedDevices = posDevices.map(d => ({
      id: d.id,
      name: d.name || "—",
      reference: d.name || d.id,
      type: "Cashier",
      status: d.lastSeenAt ? "Used" : "Not Used",
    }));

    return res.json({
      branch,
      tags: [],
      deliveryZones: [],
      users,
      sections: [],
      assignedDevices,
      assignedDiscounts: [],
      assignedCharges: [],
      assignedTimedEvents: [],
      assignedPromotions: [],
      inactivePaymentMethods: [],
    });
  } catch (err) {
    console.error("GET /branches/:idOrCode failed:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ---------- update (PUT/PATCH by id OR code OR reference) ---------- */
const UpdateBranch = CreateBranch.partial().extend({
  name: z.string().min(1).optional(),
});

async function updateBranchHandler(req: any, res: any) {
  const idOrCode = String(req.params.idOrCode);
  const id = await resolveBranchId(idOrCode);
  if (!id) return res.status(404).json({ error: "Branch not found" });

  const parsed = UpdateBranch.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const b = parsed.data;

  const data = pickDefined({
    name: b.name?.trim(),
    nameLocalized: b.nameLocalized === undefined ? undefined : nil(b.nameLocalized),
    reference: b.reference === undefined ? undefined : b.reference?.trim() || null,
    code: b.code === undefined ? undefined : b.code?.trim() || null,
    taxGroup: b.taxGroup === undefined ? undefined : nil(b.taxGroup),
    branchTaxRegistrationName:
      b.branchTaxRegistrationName === undefined
        ? undefined
        : nil(b.branchTaxRegistrationName),
    branchTaxNumber:
      b.branchTaxNumber === undefined ? undefined : nil(b.branchTaxNumber),
    openingFrom: b.openingFrom === undefined ? undefined : nil(b.openingFrom),
    openingTo: b.openingTo === undefined ? undefined : nil(b.openingTo),
    inventoryEndOfDay:
      b.inventoryEndOfDay === undefined ? undefined : nil(b.inventoryEndOfDay),
    phone: b.phone === undefined ? undefined : nil(b.phone),
    address: b.address === undefined ? undefined : nil(b.address),
    streetName: b.streetName === undefined ? undefined : nil(b.streetName),
    buildingNumber:
      b.buildingNumber === undefined ? undefined : nil(b.buildingNumber),
    additionalNumber:
      b.additionalNumber === undefined ? undefined : nil(b.additionalNumber),
    city: b.city === undefined ? undefined : nil(b.city),
    district: b.district === undefined ? undefined : nil(b.district),
    postalCode: b.postalCode === undefined ? undefined : nil(b.postalCode),
    crNumber: b.crNumber === undefined ? undefined : nil(b.crNumber),
    latitude: b.latitude === undefined ? undefined : nil(b.latitude),
    longitude: b.longitude === undefined ? undefined : nil(b.longitude),
    displayApp: b.displayApp === undefined ? undefined : !!b.displayApp,
    receiptHeader:
      b.receiptHeader === undefined ? undefined : nil(b.receiptHeader),
    receiptFooter:
      b.receiptFooter === undefined ? undefined : nil(b.receiptFooter),
  });

  try {
    const updated = await prisma.branch.update({
      where: { id },
      data,
      select: {
        id: true,
        code: true,
        name: true,
        reference: true,
        taxGroup: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      id: updated.id,
      code: updated.code,
      name: updated.name,
      reference: updated.reference,
      taxGroup: updated.taxGroup,
      createdAt: new Date(updated.createdAt).toLocaleString(),
      updatedAt: new Date(updated.updatedAt).toLocaleString(),
    });
  } catch (err: any) {
    console.error("UPDATE /branches/:idOrCode failed:", err);
    return res.status(400).json({ error: err?.message || "Update failed" });
  }
}

router.put("/:idOrCode", updateBranchHandler);
router.patch("/:idOrCode", updateBranchHandler);

export default router;
