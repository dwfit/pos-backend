// apps/api/src/routes/branches.ts
import { Router } from "express";
import { prisma } from "../db";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
const router = Router();

/* ---------- helpers ---------- */

function parseSeq(ref: string, prefix: string) {
  const s = String(ref || "").trim();
  if (!s.toUpperCase().startsWith(prefix.toUpperCase())) return null;
  const tail = s.slice(prefix.length);
  const n = Number(tail);
  return Number.isFinite(n) ? n : null;
}

async function getBrandOrThrow(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      code: true, 
    },
  });

  if (!brand) throw new Error("Brand not found");

  const prefix = String(brand.code || "").trim().toUpperCase();
  if (!prefix) throw new Error("Brand code is missing");

  return { ...brand, prefix };
}


async function generateNextBranchRef(tx: typeof prisma, brandId: string) {
  const brand = await getBrandOrThrow(brandId);

  // get last branch for this brand (prefer newest)
  const last = await tx.branch.findFirst({
    where: { brandId },
    orderBy: { createdAt: "desc" },
    select: { reference: true, code: true },
  });

  // if last exists and matches prefix, increment, else start from 1
  const lastSeq =
    (last?.reference ? parseSeq(last.reference, brand.prefix) : null) ??
    (last?.code ? parseSeq(last.code, brand.prefix) : null) ??
    0;

  const nextSeq = lastSeq + 1;
  const ref = `${brand.prefix}${String(nextSeq).padStart(2, "0")}`; // JB01
  return ref;
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
    where: {
      OR: [{ id: idOrCode }, { code: idOrCode }, { reference: idOrCode }],
    },
    select: { id: true },
  });
  return b?.id ?? null;
}

/* ---------- list (with filters) ---------- */
router.get("/", async (req, res) => {
  const simple = String(req.query.simple || "") === "1";
  const brandId = String(req.query.brandId || "").trim() || undefined;

  // ✅ SIMPLE MODE for things like discounts UI
  if (simple) {
    try {
      const branches = await prisma.branch.findMany({
        where: brandId ? { brandId } : undefined,
        orderBy: { name: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          reference: true,
          brandId: true,
          brand: { select: { name: true } },
        },
      });

      return res.json(
        branches.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          reference: b.reference,
          brandId: b.brandId,
          brandName: b.brand?.name ?? null,
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

  if (brandId) where.AND.push({ brandId }); // ✅ brand filter
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
      .map((s) => s.trim())
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
        brandId: true,
        brand: { select: { name: true } },
      },
    }),
    prisma.branch.count({ where }),
  ]);

  res.json({
    data: items.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      reference: b.reference,
      taxGroup: b.taxGroup,
      city: b.city ?? null,
      brandId: b.brandId,
      brandName: b.brand?.name ?? null,
      createdAt: new Date(b.createdAt).toLocaleString(),
    })),
    total,
    page,
    pageSize,
  });
});

/* ---------- meta: tax groups (from TaxGroup table) ---------- */
router.get("/tax-groups", async (_req, res) => {
  try {
    const groups = await prisma.taxGroup.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    //  keep your frontend unchanged (string[])
    return res.json({ data: groups.map((g) => g.name) });

    // If later you want better (id+name), use this instead:
    // return res.json({ data: groups });
  } catch (err) {
    console.error("GET /branches/tax-groups error:", err);
    return res.status(500).json({ error: "Failed to load tax groups" });
  }
});


/* ---------- meta: next reference by brand (for Generate button) ---------- */
router.get("/next-reference", async (req, res) => {
  try {
    const brandId = String(req.query.brandId || "").trim();
    if (!brandId) return res.status(400).json({ error: "brandId is required" });

    const ref = await prisma.$transaction(async (tx) => {
      return generateNextBranchRef(tx, brandId);
    });

    return res.json({ data: { reference: ref } });
  } catch (err: any) {
    console.error("GET /branches/next-reference error:", err);
    return res.status(400).json({ error: err?.message || "Failed to generate reference" });
  }
});

/* ---------- create ---------- */
const CreateBranch = z.object({
  brandId: z.string().min(1), // ✅ required
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
    const result = await prisma.$transaction(async (tx) => {
      // ✅ generate per brand if code/reference not provided
      const autoRef = await generateNextBranchRef(tx, data.brandId);

      const code = (data.code && data.code.trim()) || autoRef;
      const reference = (data.reference && data.reference.trim()) || code;

      const created = await tx.branch.create({
        data: {
          brandId: data.brandId,
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
          brandId: true,
          brand: { select: { name: true } },
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
          data: globalDiscounts.map((d) => ({
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
      brandId: result.brandId,
      brandName: result.brand?.name ?? null,
      createdAt: new Date(result.createdAt).toLocaleString(),
    });
  } catch (err: any) {
    console.error("POST /branches error:", err);
    return res.status(400).json({ error: err?.message || "Failed to create branch" });
  }
});

router.post("/", async (req, res) => {
    const schema = z.object({
      brandId: z.string(),
      name: z.string().min(1),
      nameLocalized: z.string().optional(),
      reference: z.string().optional(),
      code: z.string().optional(),
      taxGroup: z.string().nullable().optional(),

      branchTaxRegistrationName: z.string().optional(),
      branchTaxNumber: z.string().optional(),

      openingFrom: z.string().optional(),
      openingTo: z.string().optional(),
      inventoryEndOfDay: z.string().optional(),

      phone: z.string().optional(),
      address: z.string().optional(),

      streetName: z.string().optional(),
      buildingNumber: z.string().optional(),
      additionalNumber: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      postalCode: z.string().optional(),
      crNumber: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),

      displayApp: z.boolean().optional(),
      receiptHeader: z.string().optional(),
      receiptFooter: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const branch = await prisma.branch.create({
      data: {
        ...data,
      },
    });

    res.json({ data: branch });
  }
);


/* ---------- show (by id OR code OR reference) ---------- */
router.get("/:idOrCode", async (req, res) => {
  const p = String(req.params.idOrCode);
  try {
    const branch = await prisma.branch.findFirst({
      where: { OR: [{ id: p }, { code: p }, { reference: p }] },
      select: {
        id: true,
        brandId: true,
        brand: { select: { name: true } },
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

    const users = userLinks.map((u) => ({
      id: u.user.id,
      name: u.user.name ?? "—",
      email: u.user.email ?? "—",
      employeeNo: "—",
      phone: "—",
      assignedAt: u.assignedAt,
    }));

    const assignedDevices = posDevices.map((d) => ({
      id: d.id,
      name: d.name || "—",
      reference: d.name || d.id,
      type: "Cashier",
      status: d.lastSeenAt ? "Used" : "Not Used",
    }));

    return res.json({
      branch: {
        ...branch,
        brandName: branch.brand?.name ?? null,
      },
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
    brandId: b.brandId?.trim(), // ✅ allow re-assign (optional)
    name: b.name?.trim(),
    nameLocalized: b.nameLocalized === undefined ? undefined : nil(b.nameLocalized),
    reference: b.reference === undefined ? undefined : b.reference?.trim() || null,
    code: b.code === undefined ? undefined : b.code?.trim() || null,
    taxGroup: b.taxGroup === undefined ? undefined : nil(b.taxGroup),
    branchTaxRegistrationName:
      b.branchTaxRegistrationName === undefined ? undefined : nil(b.branchTaxRegistrationName),
    branchTaxNumber: b.branchTaxNumber === undefined ? undefined : nil(b.branchTaxNumber),
    openingFrom: b.openingFrom === undefined ? undefined : nil(b.openingFrom),
    openingTo: b.openingTo === undefined ? undefined : nil(b.openingTo),
    inventoryEndOfDay:
      b.inventoryEndOfDay === undefined ? undefined : nil(b.inventoryEndOfDay),
    phone: b.phone === undefined ? undefined : nil(b.phone),
    address: b.address === undefined ? undefined : nil(b.address),
    streetName: b.streetName === undefined ? undefined : nil(b.streetName),
    buildingNumber: b.buildingNumber === undefined ? undefined : nil(b.buildingNumber),
    additionalNumber:
      b.additionalNumber === undefined ? undefined : nil(b.additionalNumber),
    city: b.city === undefined ? undefined : nil(b.city),
    district: b.district === undefined ? undefined : nil(b.district),
    postalCode: b.postalCode === undefined ? undefined : nil(b.postalCode),
    crNumber: b.crNumber === undefined ? undefined : nil(b.crNumber),
    latitude: b.latitude === undefined ? undefined : nil(b.latitude),
    longitude: b.longitude === undefined ? undefined : nil(b.longitude),
    displayApp: b.displayApp === undefined ? undefined : !!b.displayApp,
    receiptHeader: b.receiptHeader === undefined ? undefined : nil(b.receiptHeader),
    receiptFooter: b.receiptFooter === undefined ? undefined : nil(b.receiptFooter),
  });

  try {
    const updated = await prisma.branch.update({
      where: { id },
      data,
      select: {
        id: true,
        brandId: true,
        brand: { select: { name: true } },
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
      brandId: updated.brandId,
      brandName: updated.brand?.name ?? null,
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
