// apps/api/src/routes/roles.ts
import { Router } from 'express';
import { prisma } from '../db';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * Permissions are stored on the role as string[] of codes, for example:
 *   - "orders.read"
 *   - "orders.manage"
 *   - "pos.discount.predefined.apply"   // ⬅️ Predefined Discounts in POS
 *
 * The API accepts permissions in two shapes:
 * 1) ["orders.read", "orders.manage", ...]
 * 2) { "orders.read": true, "orders.manage": false, ... }
 * and normalizes everything to a clean string[].
 */
const PermissionsSchema = z
  .union([
    z.array(z.string()),
    z.record(z.boolean()), // { permCode: true/false }
  ])
  .optional()
  .transform((value) => {
    let perms: string[] = [];

    if (!value) return perms;

    if (Array.isArray(value)) {
      // already string[]
      perms = value;
    } else {
      // object case: keep keys where value is truthy
      perms = Object.entries(value)
        .filter(([, v]) => !!v)
        .map(([k]) => k);
    }

    // Normalize: trim, drop empty, dedupe, sort
    const set = new Set(
      perms
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    );

    return Array.from(set).sort();
  });

const RoleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  // always ends up as string[] after transform
  permissions: PermissionsSchema,
});

/* ---------------------------- GET /roles ---------------------------- */
/* List all roles (used by your dashboard) */
router.get('/', async (_req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
    });
    console.log('GET /roles ->', roles.length, 'rows');
    // roles[].permissions is already string[]
    res.json(roles);
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Failed to load roles' });
  }
});

/* ---------------------------- POST /roles --------------------------- */
/* Create new role (used by Create Role modal) */
router.post('/', requireAuth, async (req, res) => {
  try {
    console.log('POST /roles body:', JSON.stringify(req.body));

    const parsed = RoleSchema.safeParse(req.body);

    if (!parsed.success) {
      console.warn('POST /roles validation error:', parsed.error.issues);
      return res.status(400).json({
        error: 'validation_error',
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const role = await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        // data.permissions is already a normalized string[]
        permissions: data.permissions ?? [],
      },
    });

    console.log('✅ Role created:', role.name);
    res.status(201).json(role);
  } catch (err: any) {
    console.error('❌ Error creating role:', err);

    // Prisma unique constraint (e.g. unique role name)
    if (err?.code === 'P2002') {
      return res.status(409).json({
        error: 'role_name_conflict',
        message: 'Role name already exists',
      });
    }

    res.status(500).json({ error: 'Failed to create role' });
  }
});

/* ---------------------------- PUT /roles/:id ------------------------ */
/* Update role */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const parsed = RoleSchema.safeParse(req.body);

    if (!parsed.success) {
      console.warn('PUT /roles validation error:', parsed.error.issues);
      return res.status(400).json({
        error: 'validation_error',
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const role = await prisma.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions ?? [],
      },
    });

    console.log('✅ Role updated:', role.name);
    res.json(role);
  } catch (err: any) {
    console.error('❌ Error updating role:', err);

    if (err?.code === 'P2002') {
      return res.status(409).json({
        error: 'role_name_conflict',
        message: 'Role name already exists',
      });
    }

    // Not found
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.status(500).json({ error: 'Failed to update role' });
  }
});

/* ---------------------------- DELETE /roles/:id --------------------- */
/* Delete role */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.role.delete({ where: { id } });
    console.log('🗑️ Role deleted:', id);

    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Error deleting role:', err);

    // Not found
    if (err?.code === 'P2025') {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.status(500).json({ error: 'Failed to delete role' });
  }
});

export default router;
