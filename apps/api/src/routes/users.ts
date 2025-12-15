// apps/api/src/routes/users.ts
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { hash } from '../utils/crypto';

const router = Router();

// 🔑 permission code for POS app access
const PERM_POS_APP = 'pos.cashRegister';

/* ----------------------------- Schemas ----------------------------- */

// CREATE schema (frontend payload)
const CreateUserSchema = z.object({
  name: z.string().min(2),
  language: z.string().min(2),
  email: z
    .string()
    .email()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),

  // password optional; if present must be >= 5 chars
  password: z
    .union([
      z
        .string()
        .min(5, 'Password must contain at least 5 characters'),
      z.literal(''),
    ])
    .optional()
    .transform((v) => {
      if (!v) return null;
      if (v === '') return null;
      return v;
    }),

  loginPin: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  displayLocalizedNames: z.boolean().optional().default(false),
});

// EDIT USER schema
const EditUserSchema = z.object({
  name: z.string().min(2),
  language: z.string().min(2).optional(),
  employeeNumber: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  phone: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  email: z
    .string()
    .email()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  loginPin: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  displayLocalizedNames: z.boolean().optional().default(false),
});

// CHANGE PASSWORD schema
const ChangePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(5, 'Password must contain at least 5 characters'),
});

// assign role / branches schemas
const AssignRoleSchema = z.object({
  roleId: z.string().min(1),
});

const AssignBranchesSchema = z.object({
  branchIds: z.array(z.string().min(1)),
});

/* ---------------- helper to map detail response ---------------- */

function mapUserDetail(user: any) {
  const ubs = Array.isArray(user.userBranches) ? user.userBranches : [];
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    employeeNumber: (user as any).employeeNumber ?? null,
    phone: (user as any).phone ?? null,
    displayLocalizedNames: (user as any).displayLocalizedNames ?? false,
    lastConsoleLogin: (user as any).lastConsoleLogin ?? null,
    emailVerified: (user as any).emailVerified ?? false,
    role: user.role ? { id: user.role.id, name: user.role.name } : null,
    branches: ubs.map((ub: any) => ({
      id: ub.branch.id,
      name: ub.branch.name,
      reference: (ub.branch as any).reference ?? null,
    })),
  };
}

/* ---------------------- GET /users (list) ---------------------- */

router.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        isActive: true, // 👈 we use this
        role: {
          select: {
            name: true,
            permissions: true,
          },
        },
      },
    });

    const mapped = users.map((u) => {
      const perms = u.role?.permissions ?? [];

      // Console access: user is active (role + branch linked)
      const consoleActive = u.isActive;

      // App access: active AND role has Access Cash Register permission
      const appActive = u.isActive && perms.includes(PERM_POS_APP);

      return {
        id: u.id,
        name: u.name,
        consoleAccess: consoleActive ? 'Active' : 'Inactive',
        appAccess: appActive ? 'Active' : 'Inactive',
        role: u.role?.name ?? '',
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error('GET /users error:', err);
    next(err);
  }
});

/* ---------------------- POST /users (create) ---------------------- */

router.post('/', async (req, res, next) => {
  try {
    const parsed = CreateUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid user data',
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;

    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        // DB requires non-null string for passwordHash
        passwordHash: data.password ? hash(data.password) : '',
        loginPinHash: data.loginPin ? hash(data.loginPin) : null,
        displayLocalizedNames: data.displayLocalizedNames,
        isActive: false,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        role: {
          select: {
            name: true,
            permissions: true,
          },
        },
      },
    });

    const perms = created.role?.permissions ?? [];
    const appActive = created.isActive && perms.includes(PERM_POS_APP);
    const consoleActive = created.isActive;

    const mapped = {
      id: created.id,
      name: created.name,
      consoleAccess: consoleActive ? 'Active' : 'Inactive',
      appAccess: appActive ? 'Active' : 'Inactive',
      role: created.role?.name ?? '',
    };

    res.status(201).json(mapped);
  } catch (err) {
    console.error('POST /users error:', err);
    next(err);
  }
});

/* ---------------------- GET /users/:id (detail) ---------------------- */

router.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        userBranches: {
          include: {
            branch: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(mapUserDetail(user));
  } catch (err) {
    console.error('GET /users/:id error:', err);
    next(err);
  }
});

/* ---------------- PATCH /users/:id (edit user) --------------- */

router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const data = EditUserSchema.parse(req.body);

    const updateData: any = {
      name: data.name,
      email: data.email,
      displayLocalizedNames: data.displayLocalizedNames,
    };

    if (data.loginPin && data.loginPin.trim() !== '') {
      updateData.loginPinHash = hash(data.loginPin);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        role: true,
        userBranches: {
          include: { branch: true },
        },
      },
    });

    res.json(mapUserDetail(updated));
  } catch (err) {
    console.error('PATCH /users/:id error:', err);
    next(err);
  }
});

/* ----------- PATCH /users/:id/password (change password) ------------- */

router.patch('/:id/password', async (req, res, next) => {
  try {
    const id = req.params.id;

    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid password',
        issues: parsed.error.issues,
      });
    }

    const { newPassword } = parsed.data;

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: hash(newPassword),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /users/:id/password error:', err);
    next(err);
  }
});

/* ---------------- PATCH /users/:id/activate --------------- */

router.patch('/:id/activate', async (req, res, next) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, userBranches: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const hasRole = !!user.role;
    const hasBranch = (user.userBranches ?? []).length > 0;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: hasRole && hasBranch },
      select: { id: true, name: true, isActive: true },
    });

    res.json(updated);
  } catch (err) {
    console.error('PATCH /users/:id/activate error:', err);
    next(err);
  }
});

/* ---------------- PATCH /users/:id/role (assign role) --------------- */

router.patch('/:id/role', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { roleId } = AssignRoleSchema.parse(req.body);

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: { connect: { id: roleId } },
      },
      include: {
        role: true,
        userBranches: { include: { branch: true } },
      },
    });

    const hasRole = !!updated.role;
    const hasBranch = (updated.userBranches ?? []).length > 0;

    await prisma.user.update({
      where: { id },
      data: { isActive: hasRole && hasBranch },
    });

    res.json(mapUserDetail(updated));
  } catch (err) {
    console.error('PATCH /users/:id/role error:', err);
    next(err);
  }
});

/* ---------------- PATCH /users/:id/branches (assign branches) --------------- */

router.patch('/:id/branches', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { branchIds } = AssignBranchesSchema.parse(req.body);

    await prisma.userBranch.deleteMany({
      where: { userId },
    });

    if (branchIds && branchIds.length > 0) {
      await prisma.userBranch.createMany({
        data: branchIds.map((branchId) => ({ userId, branchId })),
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        userBranches: { include: { branch: true } },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const hasRole = !!user.role;
    const hasBranch = (user.userBranches ?? []).length > 0;

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: hasRole && hasBranch },
    });

    res.json(mapUserDetail(user));
  } catch (err) {
    console.error('PATCH /users/:id/branches error:', err);
    next(err);
  }
});

/* ---------------- DELETE /users/:id (delete user) --------------- */

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;

    await prisma.userBranch.deleteMany({ where: { userId: id } });

    await prisma.user.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    next(err);
  }
});

export default router;
