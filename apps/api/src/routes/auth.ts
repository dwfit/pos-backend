// apps/api/src/routes/auth.ts
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { compare } from "../utils/crypto";
import { config } from "../config";
import { requireAuth } from "../middleware/auth";

const router = Router();

/* -------------------------------------------------------------------------- */
/* Types & helpers                                                            */
/* -------------------------------------------------------------------------- */

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  deviceId: z.string().optional(),
});

const PinLoginSchema = z.object({
  pin: z.string().min(4).max(10),
  branchId: z.string().optional(),
  deviceId: z.string().optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
  deviceId: z.string().optional(),
});

type AppRole = "ADMIN" | "MANAGER" | "AGENT";

function mapRoleNameToAppRole(dbRoleName?: string | null): AppRole {
  const n = (dbRoleName || "").toLowerCase();
  if (n === "admin") return "ADMIN";
  if (n === "manager") return "MANAGER";
  return "AGENT";
}

function normalizePermissions(raw: unknown): string[] {
  if (!raw) return [];
  let perms: string[] = [];

  if (Array.isArray(raw)) perms = raw as any[];
  else if (typeof raw === "object") {
    perms = Object.entries(raw as Record<string, any>)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }

  return Array.from(
    new Set(
      perms
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0)
    )
  ).sort();
}

function signAccessToken(payload: any): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtAccessExpiresIn || "8h",
  });
}

async function createRefreshToken(userId: string, deviceId?: string | null) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (config.jwtRefreshExpiresInDays || 30));

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

/**
 * Cookie options MUST be consistent across set/clear, otherwise browser keeps old variants.
 * - secure: true only on https
 * - sameSite: lax is fine for same-site localhost usage
 */
function cookieOptions(req: any) {
  const secure =
    req.secure === true ||
    (req.headers["x-forwarded-proto"] || "").toString().includes("https");

  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure,
    path: "/",
  };
}

function clearAuthCookies(req: any, res: any) {
  const opts = cookieOptions(req);

  // Clear the main cookies with consistent options
  res.clearCookie("pos_token", opts);
  res.clearCookie("role", { ...opts, httpOnly: false });

  // Extra safety: clear without options too (catches older variants)
  res.clearCookie("pos_token");
  res.clearCookie("role");
}

/* -------------------------------------------------------------------------- */
/* POST /auth/login                                                           */
/* -------------------------------------------------------------------------- */

router.post("/login", async (req, res) => {
  try {
    const { email, password, deviceId } = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: { select: { id: true, name: true, permissions: true } } },
    });

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const dbRoleName = user.role?.name ?? "";
    const appRole = mapRoleNameToAppRole(dbRoleName);
    const permissions = normalizePermissions(user.role?.permissions);

    const payload = {
      sub: user.id,
      email: user.email,
      role: appRole,
      roleName: dbRoleName || null,
      permissions,
      branchId: null as string | null,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = await createRefreshToken(user.id, deviceId);

    // ✅ IMPORTANT: clear old cookie variants FIRST
    clearAuthCookies(req, res);

    const opts = cookieOptions(req);

    // ✅ Set the new auth cookie
    res.cookie("pos_token", accessToken, {
      ...opts,
      maxAge: 8 * 60 * 60 * 1000,
    });

    // Optional UI cookie
    res.cookie("role", appRole, {
      ...opts,
      httpOnly: false,
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({
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
    console.error("Login error:", err);
    res.status(400).json({ error: "Invalid request" });
  }
});

/* -------------------------------------------------------------------------- */
/* POST /auth/login-pin (POS)                                                 */
/* -------------------------------------------------------------------------- */

router.post("/login-pin", async (req, res) => {
  try {
    const { pin, branchId, deviceId } = PinLoginSchema.parse(req.body);

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        loginPinHash: { not: null },
        ...(branchId ? { userBranches: { some: { branchId } } } : {}),
      },
      include: {
        role: { select: { name: true, permissions: true } },
        userBranches: { include: { branch: true } },
      },
    });

    let user: any = null;
    for (const u of users) {
      if (u.loginPinHash && (await compare(pin, u.loginPinHash))) {
        user = u;
        break;
      }
    }

    if (!user) return res.status(401).json({ error: "Invalid PIN" });

    const dbRoleName = user.role?.name ?? "";
    const appRole = mapRoleNameToAppRole(dbRoleName);
    const permissions = normalizePermissions(user.role?.permissions);

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
    const refreshToken = await createRefreshToken(user.id, deviceId);

    // ✅ clear first
    clearAuthCookies(req, res);

    const opts = cookieOptions(req);

    res.cookie("pos_token", accessToken, {
      ...opts,
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.cookie("role", appRole, {
      ...opts,
      httpOnly: false,
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      refreshToken,
      id: user.id,
      email: user.email,
      name: user.name,
      roleName: dbRoleName || null,
      appRole,
      permissions,
      branch: primaryBranch,
    });
  } catch (err) {
    console.error("PIN login error:", err);
    res.status(400).json({ error: "Invalid request" });
  }
});

/* -------------------------------------------------------------------------- */
/* POST /auth/refresh                                                          */
/* -------------------------------------------------------------------------- */

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken, deviceId } = RefreshSchema.parse(req.body);

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { role: true, userBranches: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: "REFRESH_INVALID" });
    }

    if (stored.deviceId && deviceId && stored.deviceId !== deviceId) {
      return res.status(401).json({ error: "REFRESH_DEVICE_MISMATCH" });
    }

    const user = stored.user;
    const dbRoleName = user.role?.name ?? "";
    const appRole = mapRoleNameToAppRole(dbRoleName);
    const permissions = normalizePermissions(user.role?.permissions);

    const payload = {
      sub: user.id,
      email: user.email,
      role: appRole,
      roleName: dbRoleName || null,
      permissions,
      branchId: user.userBranches[0]?.branchId ?? null,
    };

    const accessToken = signAccessToken(payload);

    // ✅ IMPORTANT: also refresh cookie for cookie-based auth (Next middleware/layout)
    const opts = cookieOptions(req);
    res.cookie("pos_token", accessToken, {
      ...opts,
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.cookie("role", appRole, {
      ...opts,
      httpOnly: false,
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(400).json({ error: "Invalid refresh request" });
  }
});

/* -------------------------------------------------------------------------- */
/* POST /auth/logout                                                          */
/* -------------------------------------------------------------------------- */

router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;

    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch (err) {
    console.error("Logout revoke error:", err);
  }

  // ✅ Clear cookies consistently
  clearAuthCookies(req, res);

  res.status(204).end();
});
router.post("/sync-users", requireAuth, async (req: any, res) => {
  try {
    const { branchId } = req.body as { branchId?: string };
    if (!branchId) return res.status(400).json({ message: "branchId is required" });

    const users = await prisma.user.findMany({
      where: {
        // user belongs to this branch via relation table
        userBranches: {
          some: { branchId },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        loginPinHash: true, // your schema field
        role: {
          select: {
            id: true,
            name: true,
            permissions: true, // if Role has permissions array
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Mobile should NOT get pin hash for offline login.
    // It should get users WITHOUT pin, then verify PIN online, OR store a separate offline PIN hash locally.
    // But if your design is to allow offline PIN, you can send loginPinHash and compare locally (bcrypt).
    // That’s workable if you accept the risk.

    const payload = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      loginPinHash: u.loginPinHash, // optional: only if you support offline PIN compare
      roleId: u.role?.id ?? null,
      roleName: u.role?.name ?? null,
      permissions: Array.isArray((u as any).role?.permissions) ? (u as any).role.permissions : [],
    }));

    return res.json({ users: payload });
  } catch (err) {
    console.error("❌ auth/sync-users error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
