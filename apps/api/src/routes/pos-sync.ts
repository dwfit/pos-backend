// apps/api/src/routes/pos-sync.ts
import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

/**
 * GET /menu  (mounted under /pos/sync)
 *
 * Mobile calls this after activation to pull menu data into SQLite.
 * Full path: /pos/sync/menu
 *
 * ?since=ISO_STRING  -> incremental sync, default 1970-01-01
 */
router.get('/menu', async (req, res) => {
  try {
    const sinceRaw = req.query.since as string | undefined;

    let since = new Date('1970-01-01T00:00:00.000Z');
    if (sinceRaw) {
      const d = new Date(sinceRaw);
      if (!isNaN(d.getTime())) {
        since = d;
      }
    }

    console.log('🔄 /pos/sync/menu since =', since.toISOString());

    const [
      categoriesRaw,
      productsRaw,
      sizes,
      modifierGroupsRaw,
      modifierItemsRaw,
    ] = await Promise.all([
      // 1) Categories (have updatedAt)
      prisma.category.findMany({
        where: {
          updatedAt: {
            gt: since,
          },
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          sort: true,
          isActive: true,
          updatedAt: true,
        },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      }),

      // 2) Products (have updatedAt)
      prisma.product.findMany({
        where: {
          updatedAt: {
            gt: since,
          },
        },
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
          tax: {
            select: {
              rate: true,
            },
          },
        },
        orderBy: [{ name: 'asc' }],
      }),

      
      prisma.productSize.findMany({
        select: {
          id: true,
          productId: true,
          name: true,
          price: true,
          code: true,
          
        },
        orderBy: [{ name: 'asc' }],
      }),

      
      prisma.modifierGroup.findMany({
        where: {
          updatedAt: {
            gt: since,
          },
        },
        select: {
          id: true,
          name: true,
          min: true,
          max: true,
          isActive: true,
          updatedAt: true,
        },
        orderBy: [{ name: 'asc' }],
      }),

      
      prisma.modifierItem.findMany({
        where: {
          updatedAt: {
            gt: since,
          },
        },
        select: {
          id: true,
          groupId: true,
          name: true,
          price: true,
          code: true,
          isActive: true,
          updatedAt: true,
        },
        orderBy: [{ name: 'asc' }],
      }),
    ]);

   

    const categories = categoriesRaw.map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl,
      sort: c.sort,
      isActive: c.isActive,
      updatedAt: c.updatedAt,
    }));

    const products = productsRaw.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      sku: p.sku,
      name: p.name,
      imageUrl: p.imageUrl,
      basePrice: p.basePrice,
      // Prefer relational tax.rate; fallback to legacy product.taxRate
      taxId: p.taxId,
      taxRate: p.tax
        ? Number(p.tax.rate)
        : p.taxRate != null
        ? Number(p.taxRate)
        : 0,
      isActive: p.isActive,
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
        isActive: g.isActive,
        updatedAt: g.updatedAt,
      };
    });

    const modifierItems = modifierItemsRaw.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      name: m.name,
      price: m.price,
      code: m.code,
      isActive: m.isActive,
      updatedAt: m.updatedAt,
    }));

    return res.json({
      since: since.toISOString(),
      categories,
      products,
      sizes,
      modifierGroups,
      modifierItems,
    });
  } catch (err) {
    console.error('GET /pos/sync/menu ERROR:', err);
    return res.status(500).json({ error: 'menu_sync_failed' });
  }
});

export default router;
