// apps/api/src/routes/pos-sync.ts
import { Router } from "express";
import { prisma } from "../db";

const router = Router();

/**
 * GET /pos/sync/menu
 *
 * ✅ REQUIRED: brandId
 * ?brandId=BRAND_ID
 *
 * ?since=ISO_STRING            -> incremental sync, default 1970-01-01
 * ?includeInactive=true|false  -> include inactive rows (default true)
 * ?forceFull=true              -> ignore since, pull everything (default false)
 */
router.get("/menu", async (req, res) => {
  try {
    const brandId =
      typeof req.query.brandId === "string" ? req.query.brandId.trim() : "";

    if (!brandId) {
      return res.status(400).json({ error: "brandId is required" });
    }

    const includeInactive =
      typeof req.query.includeInactive === "string"
        ? req.query.includeInactive.toLowerCase() === "true"
        : true;

    const forceFull =
      typeof req.query.forceFull === "string"
        ? req.query.forceFull.toLowerCase() === "true"
        : false;

    const sinceRaw = typeof req.query.since === "string" ? req.query.since : "";

    let since = new Date("1970-01-01T00:00:00.000Z");
    if (!forceFull && sinceRaw) {
      const d = new Date(sinceRaw);
      if (!isNaN(d.getTime())) since = d;
    }

    console.log("🔄 /pos/sync/menu", {
      brandId,
      includeInactive,
      forceFull,
      since: since.toISOString(),
    });

    const activeFilter = includeInactive ? {} : { isActive: true };
    const updatedFilter = forceFull ? {} : { updatedAt: { gt: since } };

    // 1) Categories
    const categoriesPromise = prisma.category.findMany({
      where: { brandId, ...activeFilter, ...updatedFilter },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        sort: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
    });

    // 2) Products
    const productsPromise = prisma.product.findMany({
      where: { brandId, ...activeFilter, ...updatedFilter },
      select: {
        id: true,
        categoryId: true,
        sku: true,
        name: true,
        imageUrl: true,
        basePrice: true,
        taxId: true,
        taxRate: true,
        isActive: true,
        updatedAt: true,
        tax: { select: { rate: true } },
      },
      orderBy: [{ name: "asc" }],
    });

    // 3) Modifier groups
    const modifierGroupsPromise = prisma.modifierGroup.findMany({
      where: { brandId, ...activeFilter, ...updatedFilter },
      select: {
        id: true,
        name: true,
        min: true,
        max: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: [{ name: "asc" }],
    });

    // Run main pulls first
    const [categoriesRaw, productsRaw, modifierGroupsRaw] = await Promise.all([
      categoriesPromise,
      productsPromise,
      modifierGroupsPromise,
    ]);

    // 4) Product sizes (safe scoping)
    let sizes: any[] = [];
    try {
      // works if ProductSize has `product` relation
      sizes = await prisma.productSize.findMany({
        where: {
          product: { brandId },
        } as any,
        select: {
          id: true,
          productId: true,
          name: true,
          price: true,
          code: true, // keep if exists on ProductSize (you had it before)
        },
        orderBy: [{ name: "asc" }],
      });
    } catch (e) {
      // fallback if `product` relation doesn't exist
      const productIds = productsRaw.map((p) => p.id);
      sizes = await prisma.productSize.findMany({
        where: {
          productId: { in: productIds.length ? productIds : ["__none__"] },
        } as any,
        select: {
          id: true,
          productId: true,
          name: true,
          price: true,
          code: true,
        },
        orderBy: [{ name: "asc" }],
      });
    }

    // 5) Modifier items (scoped by groupId list — NO relation names)
    const groupIds = modifierGroupsRaw.map((g: any) => g.id);

    const modifierItemsRaw =
      groupIds.length === 0
        ? []
        : await prisma.modifierItem.findMany({
            where: {
              groupId: { in: groupIds },
              ...(includeInactive ? {} : { isActive: true }),
              ...(forceFull ? {} : { updatedAt: { gt: since } }),
            },
            select: {
              id: true,
              groupId: true,
              name: true,
              price: true,
              // ❌ DO NOT SELECT `code` (it doesn't exist in your schema)
              isActive: true,
              updatedAt: true,
            },
            orderBy: [{ name: "asc" }],
          });

    // Map payloads
    const categories = categoriesRaw.map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl ?? null,
      sort: c.sort ?? 0,
      isActive: !!c.isActive,
      updatedAt: c.updatedAt,
    }));

    const products = productsRaw.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      sku: p.sku,
      name: p.name,
      imageUrl: p.imageUrl ?? null,
      basePrice: p.basePrice ?? 0,
      taxId: p.taxId ?? null,
      taxRate: p.tax
        ? Number(p.tax.rate)
        : p.taxRate != null
        ? Number(p.taxRate)
        : 0,
      isActive: !!p.isActive,
      updatedAt: p.updatedAt,
    }));

    const modifierGroups = modifierGroupsRaw.map((g) => {
      const min = g.min ?? 0;
      const max = g.max ?? 0;
      return {
        id: g.id,
        name: g.name,
        minSelect: min,
        maxSelect: max,
        isRequired: min > 0,
        isActive: !!g.isActive,
        updatedAt: g.updatedAt,
      };
    });

    const modifierItems = modifierItemsRaw.map((m: any) => ({
      id: m.id,
      groupId: m.groupId,
      name: m.name,
      price: m.price ?? 0,
      // ✅ keep field for app compatibility, but null
      code: null,
      isActive: !!m.isActive,
      updatedAt: m.updatedAt,
    }));

    console.log("✅ /pos/sync/menu counts", {
      categories: categories.length,
      products: products.length,
      sizes: sizes.length,
      modifierGroups: modifierGroups.length,
      modifierItems: modifierItems.length,
    });

    return res.json({
      since: since.toISOString(),
      brandId,
      includeInactive,
      forceFull,
      categories,
      products,
      sizes,
      modifierGroups,
      modifierItems,
    });
  } catch (err: any) {
    console.error("GET /pos/sync/menu ERROR:", err);
    return res.status(500).json({
      error: "menu_sync_failed",
      message: err?.message ? String(err.message) : String(err),
    });
  }
});

export default router;
