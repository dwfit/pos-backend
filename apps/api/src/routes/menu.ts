// apps/api/src/routes/menu.ts
import { Router } from "express";
import { prisma } from "../db";
import multer from "multer";
import fs from "fs";
import path from "path";
import { broadcastMenuUpdate } from "../ws"; // 👈 NEW

const router = Router();

/* -------------------------- WS helper -------------------------- */

function notifyMenuChange(event: string, payload: any) {
  try {
    // Shape is up to you; keep it small & typed on frontend
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
  if (/^https?:\/\//i.test(url)) return url; // already absolute
  const rel = url.startsWith("/") ? url : `/${url}`;
  const base =
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}${rel}`;
}

/**
 * Helper to safely parse taxId from body.
 *
 * - undefined  -> undefined (do not touch)
 * - null / ""  -> null (clear)
 * - "1" / 1    -> 1
 * - invalid    -> null (will fail FK if non-existent id)
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
  if (!L || !C) return res.status(400).json({ error: "label and code are required" });

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

  // 🔔 WS
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

  // 🔔 WS
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

  // 🔔 WS
  notifyMenuChange("size-options:deleted", { code: idCode });

  res.json({ ok: true });
});

/* -------------------------------- CATEGORIES -------------------------------- */

router.get("/categories", async (req, res) => {
  const includeInactive = toBool((req.query as any).includeInactive, true);
  const cats = await prisma.category.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sort: true, isActive: true, imageUrl: true },
  });
  res.json(
    cats.map((c) => ({ ...c, imageUrl: toPublicUrl(req, c.imageUrl) }))
  );
});

router.post("/categories", upload.single("image"), async (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  const created = await prisma.category.create({
    data: {
      name: name.trim(),
      sort: 0,
      isActive: true,
      imageUrl: imageUrl(req.file),
    },
    select: { id: true, name: true, sort: true, isActive: true, imageUrl: true },
  });

  const payload = {
    ...created,
    imageUrl: toPublicUrl(req, created.imageUrl),
  };

  // 🔔 WS
  notifyMenuChange("category:created", payload);

  res.status(201).json(payload);
});

router.put(
  "/categories/:id",
  upload.single("image"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, sort, isActive, removeImage } = req.body ?? {};
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

      // 🔔 WS
      notifyMenuChange("category:updated", payload);

      res.json(payload);
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------- PRODUCTS -------------------------------- */

router.get("/products", async (req, res) => {
  const q = req.query as any;
  const includeInactive =
    typeof q.includeInactive === "undefined"
      ? true
      : q.includeInactive === "true" || q.includeInactive === "1";
  const categoryId = q.categoryId ? String(q.categoryId) : undefined;
  const flatSizes =
    q.flatSizes === "1" || q.flatSizes === "true" ? true : false;

  const where = includeInactive
    ? categoryId
      ? { categoryId }
      : {}
    : { isActive: true, ...(categoryId ? { categoryId } : {}) };

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
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

  // Normal full payload (existing behaviour)
  const mapped = products.map((p) => ({
    ...p,
    // Prefer relational tax.rate; fall back to legacy product.taxRate
    taxRate: p.tax ? Number(p.tax.rate) : Number(p.taxRate),
    imageUrl: toPublicUrl(req, p.imageUrl),
  }));

  // 🔹 NEW: flatSizes mode – for discounts UI: product + size as rows
  if (flatSizes) {
    const flat = mapped.flatMap((p) => {
      if (p.sizes && p.sizes.length) {
        return p.sizes.map((s) => ({
          id: s.id, // productSize id
          name: `${p.name} - ${s.name}`,
          code: s.code || p.sku || null,
          isActive: p.isActive,
        }));
      }
      // fallback when product has no sizes
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

  // default behaviour
  res.json(mapped);
});

router.post("/products", upload.single("image"), async (req, res) => {
  const { sku, name, categoryId, sizes, taxId } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Product name is required" });
  }
  if (!categoryId || typeof categoryId !== "string") {
    return res.status(400).json({ error: "categoryId is required" });
  }

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
            .filter(
              (s) => s.name && Number.isFinite(s.price) && s.price >= 0
            )
        : [];
  } catch {
    /* ignore invalid JSON */
  }

  const basePrice = sizeRows.length ? Math.min(...sizeRows.map((s) => s.price)) : 0;
  const finalSku =
    typeof sku === "string" && sku.trim() ? sku.trim() : await generateUniqueSku();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
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

    // 🔔 WS
    notifyMenuChange("product:created", payload);

    res.status(201).json(payload);
  } catch (e: any) {
    if (e?.code === "P2002")
      return res.status(409).json({ error: "SKU already exists" });
    console.error("Create product error:", e);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.put(
  "/products/:id",
  upload.single("image"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
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
      const data: any = {};
      if (typeof sku === "string" && sku.trim()) data.sku = sku.trim();
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (typeof categoryId === "string" && categoryId)
        data.categoryId = categoryId;
      if (typeof basePrice !== "undefined")
        data.basePrice = Number(basePrice) || 0;

      // taxId patch
      if (typeof taxId !== "undefined") {
        data.taxId =
          taxId === null || String(taxId).trim() === ""
            ? null
            : Number(taxId);
      }

      const b = boolPatch(isActive);
      if (typeof b !== "undefined") data.isActive = b;

      if (req.file) data.imageUrl = imageUrl(req.file);
      else if (removeImage === "true") data.imageUrl = null;

      if (typeof sizes !== "undefined") {
        let list: Array<{ name: string; price: number; code: string | null }> =
          [];
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
                .filter(
                  (s) => s.name && Number.isFinite(s.price) && s.price >= 0
                );
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
          taxRate: fresh?.tax
            ? Number(fresh.tax.rate)
            : Number(fresh?.taxRate ?? 0),
          imageUrl: toPublicUrl(req, fresh?.imageUrl),
        };

        // 🔔 WS
        notifyMenuChange("product:updated", payload);

        return res.json(payload);
      }

      const updated = await prisma.product.update({
        where: { id },
        data,
        select: {
          id: true,
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
        taxRate: updated.tax
          ? Number(updated.tax.rate)
          : Number(updated.taxRate),
        imageUrl: toPublicUrl(req, updated.imageUrl),
      };

      // 🔔 WS
      notifyMenuChange("product:updated", payload);

      res.json(payload);
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------- MODIFIERS -------------------------------- */

router.get("/modifiers", async (req, res, next) => {
  try {
    const includeInactive = toBool((req.query as any).includeInactive, true);

    const groups = await prisma.modifierGroup.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        min: true,
        max: true,
        isActive: true,
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

    res.json(groups);
  } catch (err) {
    next(err);
  }
});

// create group
router.post("/modifiers", async (req, res) => {
  try {
    const { name, min, max } = req.body ?? {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Name required" });
    }

    const g = await prisma.modifierGroup.create({
      data: {
        name: String(name).trim(),
        min: Number(min) || 0,
        max: Number(max) || 0,
        isActive: true,
      },
    });

    // 🔔 WS
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

    // 🔔 WS
    notifyMenuChange("modifier-group:updated", updated);

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// support both PUT and PATCH from frontend
router.put("/modifiers/:id", updateModifierGroup);
router.patch("/modifiers/:id", updateModifierGroup);

// create item in group
router.post("/modifiers/:groupId/items", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, price, taxId } = req.body ?? {};

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

    // 🔔 WS
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
    const { itemId } = req.params;
    const { name, price, taxId, isActive } = req.body ?? {};

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

    // 🔔 WS
    notifyMenuChange("modifier-item:updated", updated);

    res.json(updated);
  } catch (err) {
    console.error("PATCH /menu/modifiers/:groupId/items/:itemId ERROR:", err);
    next(err);
  }
}

// again support both PUT and PATCH
router.put("/modifiers/:groupId/items/:itemId", updateModifierItem);
router.patch("/modifiers/:groupId/items/:itemId", updateModifierItem);

/* ----------------------- PRODUCT ⇄ MODIFIER LINKS ----------------------- */

router.get("/products/:productId/modifiers", async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!productId)
      return res.status(400).json({ error: "productId is required" });

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

    res.json(links.map((l) => l.modifier));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/products/:productId/modifiers/:modifierId",
  async (req, res, next) => {
    try {
      const { productId, modifierId } = req.params;
      if (!productId || !modifierId)
        return res
          .status(400)
          .json({ error: "productId and modifierId are required" });

      const [prod, mod] = await Promise.all([
        prisma.product.findUnique({
          where: { id: productId },
          select: { id: true },
        }),
        prisma.modifierGroup.findUnique({
          where: { id: modifierId },
          select: { id: true },
        }),
      ]);
      if (!prod) return res.status(404).json({ error: "Product not found" });
      if (!mod)
        return res.status(404).json({ error: "Modifier group not found" });

      const link = await prisma.productModifier.upsert({
        where: { productId_modifierId: { productId, modifierId } },
        create: { productId, modifierId },
        update: {},
      });

      // 🔔 WS
      notifyMenuChange("product-modifier:linked", { productId, modifierId });

      res.status(201).json(link);
    } catch (err: any) {
      if (err?.code === "P2002") return res.status(200).json({ ok: true });
      next(err);
    }
  }
);

router.delete(
  "/products/:productId/modifiers/:modifierId",
  async (req, res, next) => {
    try {
      const { productId, modifierId } = req.params;
      await prisma.productModifier.delete({
        where: { productId_modifierId: { productId, modifierId } },
      });

      // 🔔 WS
      notifyMenuChange("product-modifier:unlinked", { productId, modifierId });

      res.json({ ok: true });
    } catch (err: any) {
      if (err?.code === "P2025") {
        // still notify so clients can clean up local links if any
        notifyMenuChange("product-modifier:unlinked", { productId, modifierId });
        return res.json({ ok: true });
      }
      next(err);
    }
  }
);

/* ----------------------- Compatibility shims ----------------------- */

router.post("/product-modifiers", async (req, res, next) => {
  try {
    const { productId, modifierId } = req.body ?? {};
    if (!productId || !modifierId)
      return res
        .status(400)
        .json({ error: "productId and modifierId are required" });

    const link = await prisma.productModifier.upsert({
      where: { productId_modifierId: { productId, modifierId } },
      create: { productId, modifierId },
      update: {},
    });

    // 🔔 WS
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
    if (!productId || !modifierId)
      return res
        .status(400)
        .json({ error: "productId and modifierId are required" });

    await prisma.productModifier.delete({
      where: { productId_modifierId: { productId, modifierId } },
    });

    // 🔔 WS
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
