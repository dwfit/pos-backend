// apps/api/src/routes/auth.ts
import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../db';
import { compare } from '../utils/crypto';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

const router = Router();

/* -------------------------------------------------------------------------- */
/* Types & helpers                                                            */
/* -------------------------------------------------------------------------- */

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  // optional deviceId to distinguish WEB / POS / etc.
  deviceId: z.string().optional(),
});

// POS PIN login
const PinLoginSchema = z.object({
  pin: z.string().min(4).max(10),
  branchId: z.string().optional(),
  deviceId: z.string().optional(),
});

// Refresh token schema
const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
  deviceId: z.string().optional(),
});

// Frontend roles
type AppRole = 'ADMIN' | 'MANAGER' | 'AGENT';

function mapRoleNameToAppRole(dbRoleName?: string | null): AppRole {
  const n = (dbRoleName || '').toLowerCase();
  if (n === 'admin') return 'ADMIN';
  if (n === 'manager') return 'MANAGER';
  return 'AGENT';
}

/**
 * Normalize whatever is stored in role.permissions into a clean string[]
 * (handles null, undefined, JSON, dupes, extra spaces, etc.)
 */
function normalizePermissions(raw: unknown): string[] {
  if (!raw) return [];

  let perms: string[] = [];

  if (Array.isArray(raw)) {
    // already an array of strings
    perms = raw as string[];
  } else if (typeof raw === 'string') {
    // e.g. '["a","b"]' or "pos.discount.open.apply"
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        perms = parsed as string[];
      } else {
        // fallback: treat raw as a single code
        perms = [raw];
      }
    } catch {
      perms = [raw];
    }
  } else if (raw && typeof raw === 'object') {
    // handle shape: { "pos.discount.open.apply": true, "other": false }
    const obj = raw as Record<string, any>;
    perms = Object.entries(obj)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }

  const set = new Set(
    perms
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p) => p.length > 0),
  );

  return Array.from(set).sort();
}

/**
 * Sign a short-lived access token (JWT) with our standard payload.
 * Uses config.jwtAccessExpiresIn (e.g. "30m", "8h").
 */
function signAccessToken(payload: any): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtAccessExpiresIn || '8h',
  });
}

/**
 * Create a long-lived refresh token row in DB and return the token string.
 * (token is a random UUID, NOT a JWT)
 */
async function createRefreshToken(userId: string, deviceId?: string | null) {
  const expiresAt = new Date();
  const days = config.jwtRefreshExpiresInDays || 30;
  expiresAt.setDate(expiresAt.getDate() + days);

  const token = randomUUID();

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      deviceId: deviceId ?? null,
      expiresAt,
    },
  });

  return token;
}

/* ----------------------------- POST /auth/login ---------------------------- */

router.post('/login', async (req, res) => {
  try {
    console.log('🔐 POST /auth/login body:', req.body);

    const { email, password, deviceId } = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            permissions: true, // JSON array of permission keys (string[])
          },
        },
      },
    });

    console.log('🔎 Found user for email?', !!user, 'email =', email);

    if (!user || user.isActive === false) {
      console.log('❌ Invalid credentials: user not found or inactive');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await compare(password, user.passwordHash);
    console.log('🔑 Password match:', ok);

    if (!ok) {
      console.log('❌ Invalid credentials: wrong password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const dbRoleName = user.role?.name ?? '';
    const appRole: AppRole = mapRoleNameToAppRole(dbRoleName);

    // Normalize permissions from role
    const permissions = normalizePermissions(user.role?.permissions as unknown);

    const payload = {
      sub: user.id,
      email: user.email,
      role: appRole,
      roleName: dbRoleName || null,
      permissions,
      // for email/password login we do not fix a specific branch here
      branchId: null as string | null,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = await createRefreshToken(user.id, deviceId);

    // httpOnly session cookie for backend auth (same as before)
    res.cookie('pos_token', accessToken, {
      httpOnly: true,
      secure: false, // set true in production with https
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8h cookie; can be adjusted
      path: '/',
    });

    // Non-httpOnly cookie for frontend role checks
    res.cookie('role', appRole, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    console.log('✅ Login OK for', email, 'appRole =', appRole);

    // Return both access + refresh tokens so web/POS can store them
    res.json({
      token: accessToken, // backward compatible
      accessToken,
      refreshToken,
      id: user.id,
      email: user.email,
      name: user.name,
      roleName: dbRoleName || null,
      appRole,
      permissions,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(400).json({ error: 'Invalid request' });
  }
});

/* -------------------------- POST /auth/login-pin --------------------------- */
/**
 * POS PIN login (for cashiers/managers)
 * body: { pin: string, branchId?: string, deviceId?: string }
 *
 * This route now also issues refreshToken, so POS can auto-refresh online.
 * Offline PIN login in POS will still work using cached data in SQLite.
 */
router.post('/login-pin', async (req, res) => {
  try {
    const { pin, branchId, deviceId } = PinLoginSchema.parse(req.body);

    // Get all active users that have a PIN set.
    // We filter by branch via userBranches relation if branchId is provided.
    const candidates = await prisma.user.findMany({
      where: {
        isActive: true,
        loginPinHash: { not: null },
        ...(branchId
          ? {
              userBranches: {
                some: { branchId },
              },
            }
          : {}),
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        userBranches: {
          include: {
            branch: true,
          },
        },
      },
    });

    // Compare given PIN with hashed loginPinHash
    let user: (typeof candidates)[number] | null = null;
    for (const u of candidates) {
      if (u.loginPinHash && (await compare(pin, u.loginPinHash))) {
        user = u;
        break;
      }
    }

    if (!user) {
      console.log('❌ Invalid PIN login attempt');
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    const dbRoleName = user.role?.name ?? '';
    const appRole: AppRole = mapRoleNameToAppRole(dbRoleName);

    // Pick a primary branch (first linked branch, or matching branchId if provided)
    const primaryUb =
      (branchId
        ? user.userBranches.find((ub) => ub.branchId === branchId)
        : user.userBranches[0]) ?? null;

    const primaryBranch = primaryUb?.branch ?? null;

    // Normalize permissions from role
    const permissions = normalizePermissions(user.role?.permissions as unknown);

    const payload = {
      sub: user.id,
      email: user.email,
      role: appRole,
      roleName: dbRoleName || null,
      permissions,
      branchId: primaryBranch?.id ?? null,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = await createRefreshToken(user.id, deviceId);

    // Same cookie behavior as /auth/login
    res.cookie('pos_token', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    res.cookie('role', appRole, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    console.log('✅ PIN login OK for user', user.id, 'appRole =', appRole);

    // Also return tokens here (for POS app)
    res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      id: user.id,
      email: user.email,
      name: user.name,
      roleName: dbRoleName || null,
      appRole,
      permissions,
      branch: primaryBranch
        ? {
            id: primaryBranch.id,
            name: primaryBranch.name,
            reference: primaryBranch.reference ?? null,
          }
        : null,
    });
  } catch (err) {
    console.error('Login PIN error:', err);
    return res.status(400).json({ error: 'Invalid request' });
  }
});

/* --------------------------- POST /auth/refresh ---------------------------- */
/**
 * body: { refreshToken: string, deviceId?: string }
 *
 * Used by web admin & POS to auto-refresh access token when they get TOKEN_EXPIRED.
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, deviceId } = RefreshSchema.parse(req.body);

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: {
            role: {
              select: { name: true, permissions: true },
            },
            userBranches: {
              include: { branch: true },
            },
          },
        },
      },
    });

    if (!stored || stored.revokedAt) {
      return res.status(401).json({ error: 'REFRESH_INVALID' });
    }

    if (stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'REFRESH_EXPIRED' });
    }

    if (stored.deviceId && deviceId && stored.deviceId !== deviceId) {
      return res.status(401).json({ error: 'REFRESH_DEVICE_MISMATCH' });
    }

    const user = stored.user;
    const dbRoleName = user.role?.name ?? '';
    const appRole: AppRole = mapRoleNameToAppRole(dbRoleName);
    const permissions = normalizePermissions(user.role?.permissions as unknown);

    const primaryBranch = user.userBranches[0]?.branch ?? null;

    const payload = {
      sub: user.id,
      email: user.email,
      role: appRole,
      roleName: dbRoleName || null,
      permissions,
      branchId: primaryBranch?.id ?? null,
    };

    const accessToken = signAccessToken(payload);

    // You can also rotate the refresh token here if you want:
    // await prisma.refreshToken.update({
    //   where: { id: stored.id },
    //   data: { revokedAt: new Date() },
    // });
    // const newRefreshToken = await createRefreshToken(user.id, deviceId);
    // return res.json({ accessToken, refreshToken: newRefreshToken });

    return res.json({
      token: accessToken,
      accessToken,
      appRole,
      roleName: dbRoleName || null,
      permissions,
    });
  } catch (err) {
    console.error('POST /auth/refresh error:', err);
    return res.status(400).json({ error: 'Invalid refresh request' });
  }
});

/* ------------------------- POST /auth/sync-users --------------------------- */
/**
 * Used by POS HomeScreen "Sync Users" button.
 * body: { branchId?: string }
 *
 * Returns users with:
 *  - id, name, email
 *  - appRole, roleName
 *  - isActive
 *  - permissions[] (from Role.permissions)
 *
 * NOTE: we do NOT send login PIN hashes or plain PINs – the device only uses
 *       the PIN that the cashier typed during online login for offline cache.
 */
const SyncUsersSchema = z.object({
  branchId: z.string().optional().nullable(),
});

router.post('/sync-users', async (req, res) => {
  try {
    const { branchId } = SyncUsersSchema.parse(req.body);

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        loginPinHash: { not: null },
        ...(branchId
          ? {
              userBranches: {
                some: { branchId },
              },
            }
          : {}),
      },
      include: {
        role: {
          select: {
            name: true,
            permissions: true,
          },
        },
        userBranches: {
          include: { branch: true },
        },
      },
    });

    const payload = users.map((u) => {
      const dbRoleName = u.role?.name ?? '';
      const appRole = mapRoleNameToAppRole(dbRoleName);
      const permissions = normalizePermissions(u.role?.permissions as unknown);

      // primary branch (if filtered by branchId we try to match that)
      const primaryUb =
        (branchId
          ? u.userBranches.find((ub) => ub.branchId === branchId)
          : u.userBranches[0]) ?? null;

      const primaryBranch = primaryUb?.branch ?? null;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        appRole,
        roleName: dbRoleName || null,
        isActive: u.isActive,
        // For now we do not send PINs; POS offline cache will still
        // have the last successfully logged-in user's PIN.
        pin: null,
        permissions,
        branch: primaryBranch
          ? {
              id: primaryBranch.id,
              name: primaryBranch.name,
              reference: primaryBranch.reference ?? null,
            }
          : null,
      };
    });

    return res.json({ users: payload });
  } catch (err) {
    console.error('POST /auth/sync-users error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to sync users', details: String(err) });
  }
});

/* ------------------------------ GET /auth/me ------------------------------- */
/** Return currently logged in user + role + permissions from DB */
router.get('/me', requireAuth, async (req, res) => {
  try {
    // requireAuth puts JWT payload into req.user
    const userId = (req as any).user?.sub as string | undefined;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dbRoleName = user.role?.name ?? '';
    const appRole: AppRole = mapRoleNameToAppRole(dbRoleName);
    const permissions = normalizePermissions(user.role?.permissions as unknown);

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      roleName: dbRoleName || null,
      appRole,
      permissions,
    });
  } catch (err) {
    console.error('GET /auth/me error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

/* ---------------------------- POST /auth/logout ---------------------------- */
/**
 * Optional: body may contain { refreshToken } so we can revoke it.
 * We still clear cookies and return 204 (same behaviour for existing clients).
 */
router.post('/logout', async (req, res) => {
  try {
    const body = (req as any).body || {};
    const refreshToken = body.refreshToken as string | undefined;

    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('POST /auth/logout revoke error:', err);
    // we still clear cookies and end, to not break existing clients
  }

  res.clearCookie('pos_token');
  res.clearCookie('role');
  res.status(204).end();
});

export default router;
