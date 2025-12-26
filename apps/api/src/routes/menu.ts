// apps/api/src/routes/menu.ts
import { Router } from "express";
import { prisma } from "../db";
import multer from "multer";
import fs from "fs";
import path from "path";
import { broadcastMenuUpdate } from "../ws";

const router = Router();

/* -------------------------- WS helper -------------------------- */

function notifyMenuChange(event: string, payload: any) {
  try {
    broadcastMenuUpdate({ event, payload });
  } catch (err) {
    console.error("broadcastMenuUpdate error:", err);
  }
}

/* ------------------------------- setup ------------------------------- */

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Configure multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const unique =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    cb(null, `${unique}${ext.toLowerCase()}`);
  },
});
const upload = multer({ storage });

/* ------------------------------- helpers ------------------------------- */

async function generateUniqueSku(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate =
      "P-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const exists = await prisma.product.findUnique({
      where: { sku: candidate },
    });
    if (!exists) return candidate;
  }
  return "P-" + Date.now().toString(36).toUpperCase();
}

const toBool = (v: any, dflt: boolean | null = null) =>
  typeof v === "string"
    ? v === "true"
      ? true
      : v === "false"
      ? false
      : dflt
    : typeof v === "boolean"
    ? v
    : typeof v === "number"
    ? v === 1
      ? true
      : v === 0
      ? false
      : dflt
    : dflt;

const boolPatch = (v: any) => {
  const b = toBool(v, null);
  return b === null ? undefined : b;
};

const imageUrl = (file?: Express.Multer.File | null) =>
  file ? `/uploads/${file.filename}` : null;

/** Make stored image path publicly reachable (absolute URL). */
function toPublicUrl(req: any, url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const rel = url.startsWith("/") ? url : `/${url}`;
  const base =
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}${rel}`;
}

function requireBrandIdFromQuery(req: any): string | null {
  const brandId = String((req.query as any)?.brandId || "").trim();
  return brandId ? brandId : null;
}
function requireBrandIdFromBody(req: any): string | null {
  const brandId = String((req.body as any)?.brandId || "").trim();
  return brandId ? brandId : null;
}

/** Sometimes DELETE requests won't send body; allow query OR body. */
function requireBrandIdFromQueryOrBody(req: any): string | null {
  return requireBrandIdFromQuery(req) || requireBrandIdFromBody(req) || null;
}

/** NEW: for UPDATE routes, allow brandId from query/body; if missing, infer from DB. */
async function resolveBrandIdForCategoryUpdate(req: any, categoryId: string) {
  const supplied = requireBrandIdFromQueryOrBody(req);
  if (supplied) return { brandId: supplied, inferred: false };

  const cur = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { brandId: true },
  });
  if (!cur) return { brandId: null as any, inferred: true, notFound: true };

  return { brandId: cur.brandId, inferred: true };
}

async function resolveBrandIdForProductUpdate(req: any, productId: string) {
  const supplied = requireBrandIdFromQueryOrBody(req);
  if (supplied) return { brandId: supplied, inferred: false };

  const cur = await prisma.product.findUnique({
    where: { id: productId },
    select: { brandId: true },
  });
  if (!cur) return { brandId: null as any, inferred: true, notFound: true };

  return { brandId: cur.brandId, inferred: true };
}

async function resolveBrandIdForModifierGroupUpdate(req: any, groupId: string) {
  const supplied = requireBrandIdFromQueryOrBody(req);
  if (supplied) return { brandId: supplied, inferred: false };

  const cur = await prisma.modifierGroup.findUnique({
    where: { id: groupId },
    select: { brandId: true },
  });
  if (!cur) return { brandId: null as any, inferred: true, notFound: true };

  return { brandId: cur.brandId, inferred: true };
}

async function resolveBrandIdForModifierItemUpdate(
  req: any,
  groupId: string,
  itemId: string
) {
  const supplied = requireBrandIdFromQueryOrBody(req);
  if (supplied) return { brandId: supplied, inferred: false };

  // infer by group first (simpler + consistent)
  const cur = await prisma.modifierGroup.findUnique({
    where: { id: groupId },
    select: { brandId: true },
  });
  if (!cur) return { brandId: null as any, inferred: true, notFound: true };

  // also ensure item belongs to group (still checked later)
  return { brandId: cur.brandId, inferred: true };
}

/**
 * Helper to safely parse taxId from body.
 *
 * - undefined  -> undefined (do not touch)
 * - null / ""  -> null (clear)
 * - "1" / 1    -> 1
 * - invalid    -> null
 */
function parseTaxId(raw: any): number | null | undefined {
  if (typeof raw === "undefined") return undefined;
  if (raw === null) return null;

  const s = String(raw).trim();
  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Ensure brand exists + isActive (treat inactive as not allowed for menu edits). */
async function assertBrandActiveOrThrow(brandId: string) {
  const b = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, isActive: true },
  });
  if (!b) return { ok: false as const, code: 404, error: "Brand not found" };
  if (b.isActive === false)
    return { ok: false as const, code: 400, error: "Brand is inactive" };
  return { ok: true as const };
}

async function assertCategoryBelongsToBrand(categoryId: string, brandId: string) {
  const cat = await prisma.category.findFirst({
    where: { id: categoryId, brandId },
    select: { id: true },
  });
  if (!cat) {
    return {
      ok: false as const,
      code: 400,
      error: "Invalid category for this brand",
    };
  }
  return { ok: true as const };
}

/* ------------------------------- size presets (persistent JSON) ------------------------------- */

type SizeOption = { label: string; code: string };

const sizesFile = path.join(uploadDir, "size-options.json");

function defaultSizeOptions(): SizeOption[] {
  return [
    { label: "Small", code: "S" },
    { label: "Regular", code: "R" },
    { label: "Large", code: "L" },
    { label: "XL", code: "XL" },
  ];
}

function readSizeOptions(): SizeOption[] {
  try {
    if (!fs.existsSync(sizesFile)) return defaultSizeOptions();
    const raw = fs.readFileSync(sizesFile, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return defaultSizeOptions();
    return arr
      .map((x: any) => ({
        label: String(x?.label || "").trim(),
        code: String(x?.code || "").toUpperCase(),
      }))
      .filter((x: SizeOption) => x.label && x.code);
  } catch {
    return defaultSizeOptions();
  }
}

function writeSizeOptions(list: SizeOption[]) {
  const clean = list
    .map((s) => ({
      label: String(s.label).trim(),
      code: String(s.code).toUpperCase(),
    }))
    .filter((s) => s.label && s.code);
  fs.writeFileSync(sizesFile, JSON.stringify(clean, null, 2), "utf8");
}

// List
router.get("/size-options", (_req, res) => {
  res.json(readSizeOptions());
});

// Create
router.post("/size-options", (req, res) => {
  const { label, code } = req.body || {};
  const L = String(label || "").trim();
  const C = String(code || "").trim().toUpperCase();
  if (!L || !C)
    return res.status(400).json({ error: "label and code are required" });

  const list = readSizeOptions();
  if (
    list.some(
      (s) =>
        s.label.toLowerCase() === L.toLowerCase() ||
        s.code.toUpperCase() === C
    )
  ) {
    return res.status(409).json({ error: "Duplicate label or code" });
  }
  list.push({ label: L, code: C });
  writeSizeOptions(list);

  notifyMenuChange("size-options:created", { label: L, code: C });

  res.status(201).json({ ok: true });
});

// Update by existing code
router.put("/size-options/:code", (req, res) => {
  const idCode = String(req.params.code || "").toUpperCase();
  const { label, code } = req.body || {};
  const list = readSizeOptions();
  const idx = list.findIndex((s) => s.code.toUpperCase() === idCode);
  if (idx < 0) return res.status(404).json({ error: "Not found" });

  const nextLabel =
    typeof label === "string" && label.trim() ? label.trim() : list[idx].label;
  const nextCode =
    typeof code === "string" && code.trim()
      ? code.trim().toUpperCase()
      : list[idx].code;

  const dup = list.some(
    (s, i) =>
      i !== idx &&
      (s.label.toLowerCase() === nextLabel.toLowerCase() ||
        s.code.toUpperCase() === nextCode.toUpperCase())
  );
  if (dup) return res.status(409).json({ error: "Duplicate label or code" });

  list[idx] = { label: nextLabel, code: nextCode };
  writeSizeOptions(list);

  notifyMenuChange("size-options:updated", {
    oldCode: idCode,
    label: nextLabel,
    code: nextCode,
  });

  res.json({ ok: true });
});

// Delete by code
router.delete("/size-options/:code", (req, res) => {
  const idCode = String(req.params.code || "").toUpperCase();
  const list = readSizeOptions();
  const next = list.filter((s) => s.code.toUpperCase() !== idCode);
  if (next.length === list.length)
    return res.status(404).json({ error: "Not found" });
  writeSizeOptions(next);

  notifyMenuChange("size-options:deleted", { code: idCode });

  res.json({ ok: true });
});

/* -------------------------------- CATEGORIES -------------------------------- */

router.get("/categories", async (req, res) => {
  const includeInactive = toBool((req.query as any).includeInactive, true);

  const brandId = requireBrandIdFromQuery(req);
  if (!brandId) return res.status(400).json({ error: "brandId is required" });

  const cats = await prisma.category.findMany({
    where: {
      brandId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
    select: {
      id: true,
      brandId: true,
      name: true,
      sort: true,
      isActive: true,
      imageUrl: true,
    },
  });

  res.json(cats.map((c) => ({ ...c, imageUrl: toPublicUrl(req, c.imageUrl) })));
});

router.post("/categories", upload.single("image"), async (req, res) => {
  const { name } = req.body || {};
  const brandId = requireBrandIdFromBody(req);
  if (!brandId) return res.status(400).json({ error: "brandId is required" });

  const brandCheck = await assertBrandActiveOrThrow(brandId);
  if (!brandCheck.ok)
    return res.status(brandCheck.code).json({ error: brandCheck.error });

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  const created = await prisma.category.create({
    data: {
      brandId,
      name: name.trim(),
      sort: 0,
      isActive: true,
      imageUrl: imageUrl(req.file),
    },
    select: {
      id: true,
      brandId: true,
      name: true,
      sort: true,
      isActive: true,
      imageUrl: true,
    },
  });

  const payload = {
    ...created,
    imageUrl: toPublicUrl(req, created.imageUrl),
  };

  notifyMenuChange("category:created", payload);

  res.status(201).json(payload);
});

router.put("/categories/:id", upload.single("image"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, sort, isActive, removeImage } = req.body ?? {};

    // ✅ UPDATED: brandId is optional; resolve by query/body or infer from DB
    const resolved = await resolveBrandIdForCategoryUpdate(req, id);
    if ((resolved as any).notFound)
      return res.status(404).json({ error: "Category not found" });

    const brandId = resolved.brandId as string;

    // keep your brand active check (prevents editing inactive brand menu)
    const brandCheck = await assertBrandActiveOrThrow(brandId);
    if (!brandCheck.ok)
      return res.status(brandCheck.code).json({ error: brandCheck.error });

    const current = await prisma.category.findUnique({
      where: { id },
      select: { id: true, brandId: true },
    });
    if (!current) return res.status(404).json({ error: "Category not found" });

    // ✅ If caller supplied brandId, enforce belongs-to check (same as before)
    // ✅ If inferred, this will always match
    if (current.brandId !== brandId)
      return res
        .status(403)
        .json({ error: "Category does not belong to this brand" });

    const data: any = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof sort !== "undefined") data.sort = Number(sort) || 0;

    const b = boolPatch(isActive);
    if (typeof b !== "undefined") data.isActive = b;

    if (req.file) data.imageUrl = imageUrl(req.file);
    else if (removeImage === "true") data.imageUrl = null;

    const updated = await prisma.category.update({
      where: { id },
      data,
      select: {
        id: true,
        brandId: true,
        name: true,
        sort: true,
        isActive: true,
        imageUrl: true,
      },
    });

    const payload = {
      ...updated,
      imageUrl: toPublicUrl(req, updated.imageUrl),
    };

    notifyMenuChange("category:updated", payload);

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- PRODUCTS -------------------------------- */

router.get("/products", async (req, res) => {
  const q = req.query as any;

  const brandId = requireBrandIdFromQuery(req);
  if (!brandId) return res.status(400).json({ error: "brandId is required" });

  const includeInactive =
    typeof q.includeInactive === "undefined"
      ? true
      : q.includeInactive === "true" || q.includeInactive === "1";

  const categoryId = q.categoryId ? String(q.categoryId) : undefined;
  const flatSizes = q.flatSizes === "1" || q.flatSizes === "true" ? true : false;
  const tierId = q.tierId ? String(q.tierId) : null;

  const where: any = {
    brandId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(categoryId ? { categoryId } : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      brandId: true,
      sku: true,
      name: true,
      categoryId: true,
      basePrice: true,
      taxRate: true,
      isActive: true,
      imageUrl: true,
      taxId: true,
      tax: { select: { id: true, name: true, rate: true } },
      sizes: {
        select: { id: true, name: true, code: true, price: true },
        orderBy: { name: "asc" },
      },
      productModifiers: { select: { modifierId: true } },
    },
  });

  // tier overrides for size ids (only if tierId provided)
  let sizeOverrideMap = new Map<string, number>();
  if (tierId) {
    const allSizeIds = products.flatMap((p) => p.sizes?.map((s) => s.id) ?? []);
    if (allSizeIds.length) {
      const overrides = await prisma.tierProductSizePrice.findMany({
        where: { tierId, productSizeId: { in: allSizeIds } },
        select: { productSizeId: true, price: true },
      });
      sizeOverrideMap = new Map(
        overrides.map((o) => [o.productSizeId, Number(o.price)])
      );
    }
  }

  const mapped = products.map((p) => ({
    ...p,
    taxRate: p.tax ? Number(p.tax.rate) : Number(p.taxRate),
    imageUrl: toPublicUrl(req, p.imageUrl),
    sizes: p.sizes.map((s) => ({
      ...s,
      price:
        tierId && sizeOverrideMap.has(s.id)
          ? sizeOverrideMap.get(s.id)!
          : Number(s.price),
    })),
  }));

  if (flatSizes) {
    const flat = mapped.flatMap((p) => {
      if (p.sizes && p.sizes.length) {
        return p.sizes.map((s) => ({
          id: s.id,
          name: `${p.name} - ${s.name}`,
          code: s.code || p.sku || null,
          isActive: p.isActive,
        }));
      }
      return [
        {
          id: p.id,
          name: p.name,
          code: p.sku,
          isActive: p.isActive,
        },
      ];
    });

    return res.json(flat);
  }

  res.json(mapped);
});

router.post("/products", upload.single("image"), async (req, res) => {
  const { sku, name, categoryId, sizes, taxId } = req.body || {};
  const brandId = requireBrandIdFromBody(req);
  if (!brandId) return res.status(400).json({ error: "brandId is required" });

  const brandCheck = await assertBrandActiveOrThrow(brandId);
  if (!brandCheck.ok)
    return res.status(brandCheck.code).json({ error: brandCheck.error });

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Product name is required" });
  }
  if (!categoryId || typeof categoryId !== "string") {
    return res.status(400).json({ error: "categoryId is required" });
  }

  const catCheck = await assertCategoryBelongsToBrand(categoryId, brandId);
  if (!catCheck.ok)
    return res.status(catCheck.code).json({ error: catCheck.error });

  let sizeRows: any[] = [];
  try {
    const parsed = typeof sizes === "string" ? JSON.parse(sizes) : sizes;
    sizeRows =
      Array.isArray(parsed) && parsed.length
        ? parsed
            .map((s: any) => ({
              name: String(s?.name ?? "").trim(),
              price: Number(s?.price ?? 0),
              code: s?.code ? String(s.code) : null,
            }))
            .filter((s) => s.name && Number.isFinite(s.price) && s.price >= 0)
        : [];
  } catch {
    /* ignore invalid JSON */
  }

  const basePrice = sizeRows.length ? Math.min(...sizeRows.map((s) => s.price)) : 0;

  const finalSku =
    typeof sku === "string" && sku.trim()
      ? sku.trim()
      : await generateUniqueSku();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          brandId,
          sku: finalSku,
          name: name.trim(),
          categoryId,
          isActive: true,
          basePrice,
          imageUrl: imageUrl(req.file),
          taxId:
            typeof taxId !== "undefined" &&
            taxId !== null &&
            String(taxId).trim() !== ""
              ? Number(taxId)
              : null,
        },
        select: {
          id: true,
          brandId: true,
          name: true,
          sku: true,
          imageUrl: true,
          categoryId: true,
          basePrice: true,
          taxRate: true,
          isActive: true,
          taxId: true,
          tax: { select: { id: true, name: true, rate: true } },
        },
      });

      if (sizeRows.length) {
        await tx.productSize.createMany({
          data: sizeRows.map((s) => ({
            productId: p.id,
            name: s.name,
            code: s.code,
            price: s.price,
          })),
        });
      }

      return p;
    });

    const payload = {
      ...created,
      taxRate: created.tax ? Number(created.tax.rate) : Number(created.taxRate),
      imageUrl: toPublicUrl(req, created?.imageUrl),
    };

    notifyMenuChange("product:created", payload);

    res.status(201).json(payload);
  } catch (e: any) {
    if (e?.code === "P2002")
      return res.status(409).json({ error: "SKU already exists" });
    console.error("Create product error:", e);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.put("/products/:id", upload.single("image"), async (req, res, next) => {
  try {
    const { id } = req.params;

    // ✅ UPDATED: brandId optional; resolve by query/body or infer from DB
    const resolved = await resolveBrandIdForProductUpdate(req, id);
    if ((resolved as any).notFound)
      return res.status(404).json({ error: "Product not found" });

    const brandId = resolved.brandId as string;

    const brandCheck = await assertBrandActiveOrThrow(brandId);
    if (!brandCheck.ok)
      return res.status(brandCheck.code).json({ error: brandCheck.error });

    const current = await prisma.product.findUnique({
      where: { id },
      select: { id: true, brandId: true },
    });
    if (!current) return res.status(404).json({ error: "Product not found" });
    if (current.brandId !== brandId)
      return res
        .status(403)
        .json({ error: "Product does not belong to this brand" });

    const {
      sku,
      name,
      categoryId,
      basePrice,
      isActive,
      sizes,
      removeImage,
      taxId,
    } = req.body ?? {};

    if (typeof categoryId === "string" && categoryId) {
      const catCheck = await assertCategoryBelongsToBrand(categoryId, brandId);
      if (!catCheck.ok)
        return res.status(catCheck.code).json({ error: catCheck.error });
    }

    const data: any = {};
    if (typeof sku === "string" && sku.trim()) data.sku = sku.trim();
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof categoryId === "string" && categoryId) data.categoryId = categoryId;
    if (typeof basePrice !== "undefined") data.basePrice = Number(basePrice) || 0;

    if (typeof taxId !== "undefined") {
      data.taxId =
        taxId === null || String(taxId).trim() === "" ? null : Number(taxId);
    }

    const b = boolPatch(isActive);
    if (typeof b !== "undefined") data.isActive = b;

    if (req.file) data.imageUrl = imageUrl(req.file);
    else if (removeImage === "true") data.imageUrl = null;

    if (typeof sizes !== "undefined") {
      let list: Array<{ name: string; price: number; code: string | null }> = [];
      if (typeof sizes === "string") {
        try {
          const parsed = JSON.parse(sizes);
          if (Array.isArray(parsed)) {
            list = parsed
              .map((s: any) => ({
                name: String(s?.name ?? "").trim(),
                price: Number(s?.price ?? 0),
                code: s?.code ? String(s.code) : null,
              }))
              .filter((s) => s.name && Number.isFinite(s.price) && s.price >= 0);
          }
        } catch {
          /* ignore */
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data });
        await tx.productSize.deleteMany({ where: { productId: id } });
        if (list.length) {
          await tx.productSize.createMany({
            data: list.map((s) => ({
              productId: id,
              name: s.name,
              price: s.price,
              code: s.code,
            })),
          });
          if (typeof basePrice === "undefined") {
            await tx.product.update({
              where: { id },
              data: { basePrice: Math.min(...list.map((s) => s.price)) },
            });
          }
        }
      });

      const fresh = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          brandId: true,
          name: true,
          sku: true,
          imageUrl: true,
          categoryId: true,
          basePrice: true,
          taxRate: true,
          isActive: true,
          taxId: true,
          tax: { select: { id: true, name: true, rate: true } },
          sizes: {
            select: { id: true, name: true, code: true, price: true },
            orderBy: { name: "asc" },
          },
          productModifiers: { select: { modifierId: true } },
        },
      });

      const payload = {
        ...fresh,
        taxRate: fresh?.tax ? Number(fresh.tax.rate) : Number(fresh?.taxRate ?? 0),
        imageUrl: toPublicUrl(req, fresh?.imageUrl),
      };

      notifyMenuChange("product:updated", payload);

      return res.json(payload);
    }

    const updated = await prisma.product.update({
      where: { id },
      data,
      select: {
        id: true,
        brandId: true,
        name: true,
        sku: true,
        imageUrl: true,
        categoryId: true,
        basePrice: true,
        taxRate: true,
        isActive: true,
        taxId: true,
        tax: { select: { id: true, name: true, rate: true } },
        sizes: {
          select: { id: true, name: true, code: true, price: true },
          orderBy: { name: "asc" },
        },
        productModifiers: { select: { modifierId: true } },
      },
    });

    const payload = {
      ...updated,
      taxRate: updated.tax ? Number(updated.tax.rate) : Number(updated.taxRate),
      imageUrl: toPublicUrl(req, updated.imageUrl),
    };

    notifyMenuChange("product:updated", payload);

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- MODIFIERS -------------------------------- */

router.get("/modifiers", async (req, res, next) => {
  try {
    const q = req.query as any;
    const includeInactive = toBool(q.includeInactive, true);

    const brandId = requireBrandIdFromQuery(req);
    const tierId = q.tierId ? String(q.tierId) : null;

    if (!brandId) {
      return res.status(400).json({ error: "brandId is required" });
    }

    const groups = await prisma.modifierGroup.findMany({
      where: {
        brandId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        min: true,
        max: true,
        isActive: true,
        brandId: true,
        items: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            price: true,
            isActive: true,
            taxId: true,
            tax: { select: { id: true, name: true, rate: true } },
          },
        },
      },
    });

    if (tierId) {
      const allItemIds = groups.flatMap((g) => g.items.map((it) => it.id));
      if (allItemIds.length) {
        const overrides = await prisma.tierModifierItemPrice.findMany({
          where: { tierId, modifierItemId: { in: allItemIds } },
          select: { modifierItemId: true, price: true },
        });

        const map = new Map(
          overrides.map((o) => [o.modifierItemId, Number(o.price)])
        );

        const patched = groups.map((g) => ({
          ...g,
          items: g.items.map((it) => ({
            ...it,
            price: map.has(it.id) ? map.get(it.id)! : Number(it.price),
          })),
        }));

        return res.json(patched);
      }
    }

    return res.json(groups);
  } catch (err) {
    next(err);
  }
});

// create group
router.post("/modifiers", async (req, res) => {
  try {
    const { name, min, max } = req.body ?? {};
    const brandId = requireBrandIdFromBody(req);

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Name required" });
    }
    if (!brandId) {
      return res.status(400).json({ error: "brandId is required" });
    }

    const brandCheck = await assertBrandActiveOrThrow(brandId);
    if (!brandCheck.ok)
      return res.status(brandCheck.code).json({ error: brandCheck.error });

    const g = await prisma.modifierGroup.create({
      data: {
        name: String(name).trim(),
        min: Number(min) || 0,
        max: Number(max) || 0,
        isActive: true,
        brand: { connect: { id: brandId } },
      },
    });

    notifyMenuChange("modifier-group:created", g);

    return res.status(201).json(g);
  } catch (err) {
    console.error("POST /menu/modifiers ERROR:", err);
    return res.status(500).json({
      error: "Failed to create modifier group",
      details: String(err),
    });
  }
});

// update group (min / max / name / active)
async function updateModifierGroup(req: any, res: any, next: any) {
  try {
    const { id } = req.params;
    const { name, min, max, isActive } = req.body ?? {};

    // ✅ UPDATED: brandId optional
    const resolved = await resolveBrandIdForModifierGroupUpdate(req, id);
    if ((resolved as any).notFound)
      return res.status(404).json({ error: "Modifier group not found" });

    const brandId = resolved.brandId as string;

    const brandCheck = await assertBrandActiveOrThrow(brandId);
    if (!brandCheck.ok)
      return res.status(brandCheck.code).json({ error: brandCheck.error });

    const cur = await prisma.modifierGroup.findUnique({
      where: { id },
      select: { id: true, brandId: true },
    });
    if (!cur) return res.status(404).json({ error: "Modifier group not found" });
    if (cur.brandId !== brandId)
      return res
        .status(403)
        .json({ error: "Modifier group does not belong to this brand" });

    const data: any = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof min !== "undefined") data.min = Number(min) || 0;
    if (typeof max !== "undefined") data.max = Number(max) || 0;

    const b = boolPatch(isActive);
    if (typeof b !== "undefined") data.isActive = b;

    const updated = await prisma.modifierGroup.update({
      where: { id },
      data,
    });

    notifyMenuChange("modifier-group:updated", updated);

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

router.put("/modifiers/:id", updateModifierGroup);
router.patch("/modifiers/:id", updateModifierGroup);

// create item in group
router.post("/modifiers/:groupId/items", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, price, taxId } = req.body ?? {};
    const brandId = requireBrandIdFromBody(req);
    if (!brandId) return res.status(400).json({ error: "brandId is required" });

    const group = await prisma.modifierGroup.findUnique({
      where: { id: groupId },
      select: { id: true, brandId: true },
    });
    if (!group) return res.status(404).json({ error: "Modifier group not found" });
    if (group.brandId !== brandId)
      return res
        .status(403)
        .json({ error: "Modifier group does not belong to this brand" });

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Item name required" });
    }

    const parsedTaxId = parseTaxId(taxId);
    const data: any = {
      groupId,
      name: String(name).trim(),
      price: Number(price) || 0,
      isActive: true,
    };
    if (typeof parsedTaxId !== "undefined") data.taxId = parsedTaxId;

    const item = await prisma.modifierItem.create({ data });

    notifyMenuChange("modifier-item:created", item);

    return res.status(201).json(item);
  } catch (err) {
    console.error("POST /menu/modifiers/:groupId/items ERROR:", err);
    return res.status(500).json({
      error: "Failed to create modifier item",
      details: String(err),
    });
  }
});

// update item (name / price / tax / active)
async function updateModifierItem(req: any, res: any, next: any) {
  try {
    const { groupId, itemId } = req.params;
    const { name, price, taxId, isActive } = req.body ?? {};

    // ✅ UPDATED: brandId optional
    const resolved = await resolveBrandIdForModifierItemUpdate(req, groupId, itemId);
    if ((resolved as any).notFound)
      return res.status(404).json({ error: "Modifier group not found" });

    const brandId = resolved.brandId as string;

    const brandCheck = await assertBrandActiveOrThrow(brandId);
    if (!brandCheck.ok)
      return res.status(brandCheck.code).json({ error: brandCheck.error });

    const group = await prisma.modifierGroup.findUnique({
      where: { id: groupId },
      select: { id: true, brandId: true },
    });
    if (!group) return res.status(404).json({ error: "Modifier group not found" });
    if (group.brandId !== brandId)
      return res
        .status(403)
        .json({ error: "Modifier group does not belong to this brand" });

    const itemExists = await prisma.modifierItem.findFirst({
      where: { id: itemId, groupId },
      select: { id: true },
    });
    if (!itemExists)
      return res.status(404).json({ error: "Modifier item not found" });

    const data: any = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof price !== "undefined") data.price = Number(price) || 0;

    const parsedTaxId = parseTaxId(taxId);
    if (typeof parsedTaxId !== "undefined") data.taxId = parsedTaxId;

    const b = boolPatch(isActive);
    if (typeof b !== "undefined") data.isActive = b;

    const updated = await prisma.modifierItem.update({
      where: { id: itemId },
      data,
    });

    notifyMenuChange("modifier-item:updated", updated);

    res.json(updated);
  } catch (err) {
    console.error("PATCH/PUT /menu/modifiers/:groupId/items/:itemId ERROR:", err);
    next(err);
  }
}

router.put("/modifiers/:groupId/items/:itemId", updateModifierItem);
router.patch("/modifiers/:groupId/items/:itemId", updateModifierItem);

/* ----------------------- PRODUCT ⇄ MODIFIER LINKS ----------------------- */

router.get("/products/:productId/modifiers", async (req, res, next) => {
  try {
    const { productId } = req.params;
    const brandId = requireBrandIdFromQuery(req);
    if (!productId) return res.status(400).json({ error: "productId is required" });
    if (!brandId) return res.status(400).json({ error: "brandId is required" });

    const prod = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, brandId: true },
    });
    if (!prod) return res.status(404).json({ error: "Product not found" });
    if (prod.brandId !== brandId)
      return res.status(403).json({ error: "Product does not belong to this brand" });

    const links = await prisma.productModifier.findMany({
      where: { productId },
      include: {
        modifier: {
          include: {
            items: { where: { isActive: true }, orderBy: { name: "asc" } },
          },
        },
      },
    });

    res.json(links.map((l) => l.modifier).filter((m) => m.brandId === brandId));
  } catch (err) {
    next(err);
  }
});

router.post("/products/:productId/modifiers/:modifierId", async (req, res, next) => {
  try {
    const { productId, modifierId } = req.params;
    const brandId = requireBrandIdFromBody(req);
    if (!brandId) return res.status(400).json({ error: "brandId is required" });

    if (!productId || !modifierId)
      return res.status(400).json({ error: "productId and modifierId are required" });

    const [prod, mod] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, brandId: true },
      }),
      prisma.modifierGroup.findUnique({
        where: { id: modifierId },
        select: { id: true, brandId: true },
      }),
    ]);

    if (!prod) return res.status(404).json({ error: "Product not found" });
    if (!mod) return res.status(404).json({ error: "Modifier group not found" });

    if (prod.brandId !== brandId)
      return res.status(403).json({ error: "Product does not belong to this brand" });
    if (mod.brandId !== brandId)
      return res.status(403).json({ error: "Modifier group does not belong to this brand" });

    const link = await prisma.productModifier.upsert({
      where: { productId_modifierId: { productId, modifierId } },
      create: { productId, modifierId },
      update: {},
    });

    notifyMenuChange("product-modifier:linked", { productId, modifierId });

    res.status(201).json(link);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(200).json({ ok: true });
    next(err);
  }
});

router.delete("/products/:productId/modifiers/:modifierId", async (req, res, next) => {
  try {
    const { productId, modifierId } = req.params;

    // ✅ allow brandId from query OR body (DELETE often has no body in browsers)
    const brandId = requireBrandIdFromQueryOrBody(req);
    if (!brandId) return res.status(400).json({ error: "brandId is required" });

    const prod = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, brandId: true },
    });
    if (!prod) return res.status(404).json({ error: "Product not found" });
    if (prod.brandId !== brandId)
      return res.status(403).json({ error: "Product does not belong to this brand" });

    await prisma.productModifier.delete({
      where: { productId_modifierId: { productId, modifierId } },
    });

    notifyMenuChange("product-modifier:unlinked", { productId, modifierId });

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      notifyMenuChange("product-modifier:unlinked", {
        productId: (req as any).params?.productId,
        modifierId: (req as any).params?.modifierId,
      });
      return res.json({ ok: true });
    }
    next(err);
  }
});

/* ----------------------- Compatibility shims ----------------------- */
/**
 * NOTE:
 * These shims are brand-unsafe without brandId.
 * We keep them, but enforce brandId in body for enterprise correctness.
 */

router.post("/product-modifiers", async (req, res, next) => {
  try {
    const { productId, modifierId } = req.body ?? {};
    const brandId = requireBrandIdFromBody(req);
    if (!brandId) return res.status(400).json({ error: "brandId is required" });

    if (!productId || !modifierId)
      return res.status(400).json({ error: "productId and modifierId are required" });

    const [prod, mod] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, brandId: true },
      }),
      prisma.modifierGroup.findUnique({
        where: { id: modifierId },
        select: { id: true, brandId: true },
      }),
    ]);

    if (!prod) return res.status(404).json({ error: "Product not found" });
    if (!mod) return res.status(404).json({ error: "Modifier group not found" });

    if (prod.brandId !== brandId || mod.brandId !== brandId)
      return res.status(403).json({ error: "Cross-brand link is not allowed" });

    const link = await prisma.productModifier.upsert({
      where: { productId_modifierId: { productId, modifierId } },
      create: { productId, modifierId },
      update: {},
    });

    notifyMenuChange("product-modifier:linked", { productId, modifierId });

    res.status(201).json(link);
  } catch (err: any) {
    if (err?.code === "P2002") {
      notifyMenuChange("product-modifier:linked", req.body ?? {});
      return res.status(200).json({ ok: true });
    }
    next(err);
  }
});

router.delete("/product-modifiers", async (req, res, next) => {
  try {
    const { productId, modifierId } = req.body ?? {};
    const brandId = requireBrandIdFromBody(req);
    if (!brandId) return res.status(400).json({ error: "brandId is required" });

    if (!productId || !modifierId)
      return res.status(400).json({ error: "productId and modifierId are required" });

    const prod = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, brandId: true },
    });
    if (!prod) return res.status(404).json({ error: "Product not found" });
    if (prod.brandId !== brandId)
      return res.status(403).json({ error: "Product does not belong to this brand" });

    await prisma.productModifier.delete({
      where: { productId_modifierId: { productId, modifierId } },
    });

    notifyMenuChange("product-modifier:unlinked", { productId, modifierId });

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      notifyMenuChange("product-modifier:unlinked", req.body ?? {});
      return res.json({ ok: true });
    }
    next(err);
  }
});

export default router;
