// apps/api/src/routes/roles.ts
import { Router } from "express";
import { prisma } from "../db";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * Permissions are stored on the role as string[] of codes, for example:
 *   - "orders.read"
 *   - "orders.manage"
 *   - "pos.discount.predefined.apply"
 *
 * The API accepts permissions in two shapes:
 * 1) ["orders.read", "orders.manage", ...]
 * 2) { "orders.read": true, "orders.manage": false, ... }
 * and normalizes everything to a clean string[].
 */
const PermissionsSchema = z
  .union([z.array(z.string()), z.record(z.boolean())])
  .optional()
  .transform((value) => {
    let perms: string[] = [];

    if (!value) return perms;

    if (Array.isArray(value)) {
      perms = value;
    } else {
      perms = Object.entries(value)
        .filter(([, v]) => !!v)
        .map(([k]) => k);
    }

    const set = new Set(
      perms
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    );

    return Array.from(set).sort();
  });

/**
 * allowedBrandIds rules:
 * - not provided / null / []  => allow ALL brands (store zero rows in RoleBrand)
 * - [id1, id2]               => restrict to these brands (store rows)
 */
const AllowedBrandIdsSchema = z
  .union([z.array(z.string().min(1)), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return null; // undefined or null -> allow all
    if (!Array.isArray(v)) return null;

    const cleaned = Array.from(
      new Set(v.map((x) => x.trim()).filter((x) => x.length > 0))
    );

    // empty array means allow all (recommended)
    return cleaned.length ? cleaned : null;
  });

const RoleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  permissions: PermissionsSchema, // normalized to string[]
  // NEW:
  allowedBrandIds: AllowedBrandIdsSchema, // null => allow all
});

/* ---------------------------- Helpers ---------------------------- */

function roleToDto(role: any) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: Array.isArray(role.permissions) ? role.permissions : [],
    allowedOrganization: role.allowedOrganization ?? true,
    allowedBrandIds: Array.isArray(role.roleBrands)
      ? role.roleBrands.map((rb: any) => rb.brandId)
      : [],
  };
}

/* ---------------------------- GET /roles ---------------------------- */
/* List all roles (used by your dashboard) */
router.get("/", async (_req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { createdAt: "desc" },
      include: { roleBrands: { select: { brandId: true } } },
    });

    console.log("GET /roles ->", roles.length, "rows");
    res.json(roles.map(roleToDto));
  } catch (err) {
    console.error("Error fetching roles:", err);
    res.status(500).json({ error: "Failed to load roles" });
  }
});

/* ---------------------------- GET /roles/:id ------------------------ */
/* Optional: fetch single role (handy for debugging / future UI) */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const role = await prisma.role.findUnique({
      where: { id },
      include: { roleBrands: { select: { brandId: true } } },
    });

    if (!role) return res.status(404).json({ error: "Role not found" });

    res.json(roleToDto(role));
  } catch (err) {
    console.error("Error fetching role:", err);
    res.status(500).json({ error: "Failed to load role" });
  }
});

/* ---------------------------- POST /roles --------------------------- */
/* Create new role (used by Create Role modal) */
router.post("/", requireAuth, async (req, res) => {
  try {
    console.log("POST /roles body:", JSON.stringify(req.body));

    const parsed = RoleSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn("POST /roles validation error:", parsed.error.issues);
      return res.status(400).json({
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const role = await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions ?? [],

        // ✅ always true
        allowedOrganization: true,

        // ✅ if null => allow all => don't create any roleBrands rows
        ...(data.allowedBrandIds
          ? {
              roleBrands: {
                create: data.allowedBrandIds.map((brandId) => ({ brandId })),
              },
            }
          : {}),
      },
      include: { roleBrands: { select: { brandId: true } } },
    });

    console.log("✅ Role created:", role.name);
    res.status(201).json(roleToDto(role));
  } catch (err: any) {
    console.error("❌ Error creating role:", err);

    if (err?.code === "P2002") {
      return res.status(409).json({
        error: "role_name_conflict",
        message: "Role name already exists",
      });
    }

    // If some brandId is invalid you'll usually get P2003 (FK constraint)
    if (err?.code === "P2003") {
      return res.status(400).json({
        error: "invalid_brand",
        message: "One or more brandIds are invalid",
      });
    }

    res.status(500).json({ error: "Failed to create role" });
  }
});

/* ---------------------------- PUT /roles/:id ------------------------ */
/* Update role */
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const parsed = RoleSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn("PUT /roles validation error:", parsed.error.issues);
      return res.status(400).json({
        error: "validation_error",
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

        // ✅ always true
        allowedOrganization: true,

        // ✅ Replace brand links
        roleBrands: data.allowedBrandIds
          ? {
              deleteMany: {}, // remove existing restrictions
              create: data.allowedBrandIds.map((brandId) => ({ brandId })),
            }
          : {
              // null => allow all => clear restrictions (no rows)
              deleteMany: {},
            },
      },
      include: { roleBrands: { select: { brandId: true } } },
    });

    console.log("✅ Role updated:", role.name);
    res.json(roleToDto(role));
  } catch (err: any) {
    console.error("❌ Error updating role:", err);

    if (err?.code === "P2002") {
      return res.status(409).json({
        error: "role_name_conflict",
        message: "Role name already exists",
      });
    }

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Role not found" });
    }

    if (err?.code === "P2003") {
      return res.status(400).json({
        error: "invalid_brand",
        message: "One or more brandIds are invalid",
      });
    }

    res.status(500).json({ error: "Failed to update role" });
  }
});

/* ---------------------------- DELETE /roles/:id --------------------- */
/* Delete role */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // If your DB has constraints with users/roles, delete may fail.
    // This keeps your existing behavior.
    await prisma.role.delete({ where: { id } });

    console.log("🗑️ Role deleted:", id);
    res.json({ success: true });
  } catch (err: any) {
    console.error("❌ Error deleting role:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Role not found" });
    }

    res.status(500).json({ error: "Failed to delete role" });
  }
});

export default router;
