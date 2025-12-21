// apps/api/src/routes/session.ts
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ALL_PERMISSIONS } from "../permissions/all-permissions";

const router = Router();

function normalizePermissions(raw: unknown): string[] {
  if (!raw) return [];
  let perms: string[] = [];

  if (Array.isArray(raw)) perms = raw as string[];
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      perms = Array.isArray(parsed) ? (parsed as string[]) : [raw];
    } catch {
      perms = [raw];
    }
  } else if (typeof raw === "object") {
    const obj = raw as Record<string, any>;
    perms = Object.entries(obj)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }

  return Array.from(new Set(perms.map((p) => String(p).trim()).filter(Boolean))).sort();
}

/**
 * GET /session
 * Used by web layout for:
 * - permissions (sidebar)
 * - brands dropdown
 *
 * Admin:
 * - sees ALL brands
 * - gets ALL permissions
 */
router.get("/session", requireAuth, async (req: AuthRequest, res) => {
  try {
    const sub = req.user?.sub;
    if (!sub) return res.status(401).json({ error: "UNAUTHENTICATED" });

    const user = await prisma.user.findUnique({
      where: { id: sub },
      include: {
        role: { select: { id: true, name: true, permissions: true } },
      },
    });

    if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });

    const roleName = (user.role?.name || "").toLowerCase();
    const admin = roleName === "admin";

    let permissions = normalizePermissions(user.role?.permissions);
    if (admin) {
      permissions = Array.from(new Set([...permissions, ...ALL_PERMISSIONS])).sort();
    }

    // brands dropdown
    // ✅ Admin sees all brands
    const brands = await prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    });

    res.json({
      user: {
        sub: user.id,
        email: user.email,
        roleName: user.role?.name ?? null,
        role: admin ? "ADMIN" : (req.user?.role ?? null), // keep token role if you want
        permissions,
        allowAllBrands: admin, // ✅ Admin always true
        allowedBrandIds: admin ? brands.map((b) => b.id) : [], // you can extend later
      },
      brands,
    });
  } catch (err) {
    console.error("GET /session failed:", err);
    res.status(500).json({ error: "Failed to load session" });
  }
});

export default router;
