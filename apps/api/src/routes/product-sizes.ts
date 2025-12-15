// apps/api/src/routes/product-sizes.ts
import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const sizes = await prisma.productSize.findMany({
    include: {
      product: true, // adjust relation name if different
    },
    orderBy: [
      { product: { name: 'asc' } },
      { name: 'asc' },
    ],
  });

  const result = sizes.map((s) => ({
    id: s.id,
    productName: s.product?.name ?? '',
    sizeName: s.name,
    name: s.name,
  }));

  res.json(result);
});

export default router;
