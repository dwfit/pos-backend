import { Router } from 'express';
import { prisma } from '../db';

const r = Router();

/** List branches */
r.get('/', async (_req, res) => {
  const rows = await prisma.branch.findMany({ orderBy: { code: 'asc' } });
  res.json(rows);
});

/** Create branch */
r.post('/', async (req, res) => {
  const { code, name, tz = 'Asia/Riyadh', address, vatNo, isActive = true } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

  try {
    const row = await prisma.branch.create({
      data: { code, name, tz, address, vatNo, isActive },
    });
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'code must be unique' });
    console.error(e);
    res.status(500).json({ error: 'failed to create branch' });
  }
});

/** Get one */
r.get('/:id', async (req, res) => {
  const row = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

/** Update */
r.put('/:id', async (req, res) => {
  const { name, tz, address, vatNo, isActive } = req.body || {};
  try {
    const row = await prisma.branch.update({
      where: { id: req.params.id },
      data: { name, tz, address, vatNo, isActive },
    });
    res.json(row);
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'not found' });
    console.error(e);
    res.status(500).json({ error: 'failed to update branch' });
  }
});

/** Delete */
r.delete('/:id', async (req, res) => {
  try {
    await prisma.branch.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'not found' });
    console.error(e);
    res.status(500).json({ error: 'failed to delete branch' });
  }
});

export default r;
