// apps/api/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../db";

export interface AuthPayload {
  sub: string;
  email: string;

  role?: string | null;
  roleName?: string | null;
  branchId?: string | null;

  permissions?: string[];

  roleId?: string | null;
  allowedOrganization?: boolean;
  allowedBrandIds?: string[];
  allowAllBrands?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthPayload & {
    permissions: string[];
    roleId: string | null;
    allowedOrganization: boolean;
    allowedBrandIds: string[];
    allowAllBrands: boolean;
  };
}

type TokenSource = "bearer" | "cookie" | "rawCookie" | "none";

function getNowIso() {
  return new Date().toISOString();
}

function safeDecodeJwt(token: string) {
  try {
    // decode without verification, just to inspect exp/iat
    return jwt.decode(token) as any;
  } catch {
    return null;
  }
}

/**
 * Try to extract JWT token from:
 *  - Authorization: Bearer <token>
 *  - cookies.pos_token / cookies.token (if cookie-parser is enabled)
 *  - raw Cookie header (manual parse)
 */
function extractToken(req: Request): { token: string | null; source: TokenSource } {
  // 1) Authorization: Bearer ...
  const header = req.headers.authorization;
  const bearer =
    header && header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (bearer) return { token: bearer, source: "bearer" };

  // 2) Cookie parsed by cookie-parser
  const cookies = (req as any).cookies || {};
  const cookieToken = cookies.pos_token || cookies.token || null;
  if (cookieToken) return { token: cookieToken, source: "cookie" };

  // 3) Raw Cookie header (in case cookie-parser is not wired)
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const parts = cookieHeader.split(";").map((p) => p.trim());
    for (const part of parts) {
      if (part.startsWith("pos_token=")) {
        return {
          token: decodeURIComponent(part.substring("pos_token=".length)),
          source: "rawCookie",
        };
      }
      if (part.startsWith("token=")) {
        return {
          token: decodeURIComponent(part.substring("token=".length)),
          source: "rawCookie",
        };
      }
    }
  }

  return { token: null, source: "none" };
}

function normalizePermissions(input: any): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .filter((p) => typeof p === "string")
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      )
    ).sort();
  }

  if (typeof input === "object") {
    return Array.from(
      new Set(
        Object.entries(input)
          .filter(([, v]) => !!v)
          .map(([k]) => String(k).trim())
          .filter((k) => k.length > 0)
      )
    ).sort();
  }

  return [];
}

function authJson(res: Response, status: number, payload: Record<string, any>) {
  return res.status(status).json(payload);
}

async function loadDbRoleScope(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roleId: true,
        role: {
          select: {
            id: true,
            permissions: true,
            allowedOrganization: true,
            roleBrands: { select: { brandId: true } },
          },
        },
      },
    });

    if (!user || !user.role) {
      return {
        roleId: null as string | null,
        dbPermissions: [] as string[],
        allowedOrganization: true,
        allowedBrandIds: [] as string[],
        allowAllBrands: true,
      };
    }

    const dbPermissions = normalizePermissions(user.role.permissions);
    const allowedBrandIds = user.role.roleBrands.map((x) => x.brandId);
    const allowAllBrands = allowedBrandIds.length === 0;

    return {
      roleId: user.role.id,
      dbPermissions,
      allowedOrganization: user.role.allowedOrganization ?? true,
      allowedBrandIds,
      allowAllBrands,
    };
  } catch (e) {
    console.error("loadDbRoleScope error:", e);
    return {
      roleId: null as string | null,
      dbPermissions: [] as string[],
      allowedOrganization: true,
      allowedBrandIds: [] as string[],
      allowAllBrands: true,
    };
  }
}

function decodeJwtAndBuildBase(decoded: any) {
  const sub: string =
    decoded?.sub ||
    decoded?.id ||
    decoded?.userId ||
    decoded?.user_id ||
    decoded?.uid ||
    (decoded?.user && (decoded.user.id || decoded.user.userId)) ||
    "";

  const email: string =
    decoded?.email || (decoded?.user && decoded.user.email) || "";

  const role: string | null =
    decoded?.role || decoded?.appRole || (decoded?.user && decoded.user.role) || null;

  const roleName: string | null =
    decoded?.roleName || (decoded?.user && decoded.user.roleName) || null;

  const branchId: string | null =
    decoded?.branchId ||
    decoded?.branch_id ||
    (decoded?.user && (decoded.user.branchId || decoded.user.branch_id)) ||
    null;

  let jwtPermissions: string[] = [];
  if (Array.isArray(decoded?.permissions)) jwtPermissions = decoded.permissions;
  else if (Array.isArray(decoded?.perms)) jwtPermissions = decoded.perms;
  else if (decoded?.user && Array.isArray(decoded.user.permissions))
    jwtPermissions = decoded.user.permissions;
  else if (decoded?.role?.permissions && Array.isArray(decoded.role.permissions))
    jwtPermissions = decoded.role.permissions;

  jwtPermissions = normalizePermissions(jwtPermissions);

  return { sub, email, role, roleName, branchId, jwtPermissions };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const { token, source } = extractToken(req);

  if (!token) {
    console.warn("requireAuth: no token found", {
      source,
      cookieKeys: Object.keys((req as any).cookies || {}),
      hasAuthorization: Boolean(req.headers.authorization),
      hasCookieHeader: Boolean(req.headers.cookie),
    });

    return authJson(res, 401, {
      error: "UNAUTHENTICATED",
      code: "UNAUTHENTICATED",
      message: "Authentication required. Please log in again.",
      tokenSource: source,
      serverNow: getNowIso(),
    });
  }

  try {
    const decoded: any = jwt.verify(token, config.jwtSecret);

    const base = decodeJwtAndBuildBase(decoded);
    if (!base.sub) {
      return authJson(res, 401, {
        error: "INVALID_TOKEN",
        code: "INVALID_TOKEN",
        message: "Invalid session. Please log in again.",
        tokenSource: source,
        serverNow: getNowIso(),
      });
    }

    const scope = await loadDbRoleScope(String(base.sub));

    const mergedPermissions = Array.from(
      new Set([...(scope.dbPermissions || []), ...(base.jwtPermissions || [])])
    ).sort();

    req.user = {
      sub: base.sub,
      email: base.email,
      role: base.role,
      roleName: base.roleName,
      branchId: base.branchId,

      permissions: mergedPermissions,

      roleId: scope.roleId,
      allowedOrganization: scope.allowedOrganization,
      allowedBrandIds: scope.allowedBrandIds,
      allowAllBrands: scope.allowAllBrands,
    };

    return next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      // 👇 decode to show exp/iat and confirm which token source is being used
      const raw = safeDecodeJwt(token);
      console.error("requireAuth expired:", {
        tokenSource: source,
        serverNow: getNowIso(),
        expiredAt: err?.expiredAt,
        jwtExp: raw?.exp ? new Date(raw.exp * 1000).toISOString() : null,
        jwtIat: raw?.iat ? new Date(raw.iat * 1000).toISOString() : null,
        jwtSub: raw?.sub || raw?.id || raw?.userId || null,
      });

      return authJson(res, 401, {
        error: "TOKEN_EXPIRED",
        code: "TOKEN_EXPIRED",
        message: "Session has expired. Please log in again.",
        expiredAt: err?.expiredAt ?? null,
        tokenSource: source,
        serverNow: getNowIso(),
        jwtExp: raw?.exp ?? null,
        jwtIat: raw?.iat ?? null,
      });
    }

    if (err?.name === "JsonWebTokenError" || err?.name === "NotBeforeError") {
      console.error("requireAuth invalid token:", { tokenSource: source, err });
      return authJson(res, 401, {
        error: "INVALID_TOKEN",
        code: "INVALID_TOKEN",
        message: "Invalid session. Please log in again.",
        tokenSource: source,
        serverNow: getNowIso(),
      });
    }

    console.error("requireAuth unknown:", { tokenSource: source, err });
    return authJson(res, 401, {
      error: "UNAUTHORIZED",
      code: "UNAUTHORIZED",
      message: "Unauthorized. Please log in again.",
      tokenSource: source,
      serverNow: getNowIso(),
    });
  }
}

// optionalAuth / requireRole / requirePerm / requireAnyPerm / brand helpers
// keep your existing implementations (unchanged) ↓↓↓

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const { token } = extractToken(req);
  if (!token) return next();
  try {
    const decoded: any = jwt.verify(token, config.jwtSecret);
    const base = decodeJwtAndBuildBase(decoded);
    if (!base.sub) return next();

    const scope = await loadDbRoleScope(String(base.sub));
    const mergedPermissions = Array.from(
      new Set([...(scope.dbPermissions || []), ...(base.jwtPermissions || [])])
    ).sort();

    req.user = {
      sub: base.sub,
      email: base.email,
      role: base.role,
      roleName: base.roleName,
      branchId: base.branchId,
      permissions: mergedPermissions,
      roleId: scope.roleId,
      allowedOrganization: scope.allowedOrganization,
      allowedBrandIds: scope.allowedBrandIds,
      allowAllBrands: scope.allowAllBrands,
    };

    return next();
  } catch {
    return next();
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return authJson(res, 401, {
        error: "UNAUTHENTICATED",
        code: "UNAUTHENTICATED",
        message: "Authentication required. Please log in again.",
      });
    }
    if (!roles.length) return next();
    const userRole = req.user.role;
    if (!userRole || !roles.includes(userRole)) {
      return authJson(res, 403, {
        error: "FORBIDDEN",
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
      });
    }
    return next();
  };
}

export function requirePerm(code: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return authJson(res, 401, {
        error: "UNAUTHENTICATED",
        code: "UNAUTHENTICATED",
        message: "Authentication required. Please log in again.",
      });
    }
    const perms = req.user.permissions || [];
    if (!perms.includes(code)) {
      return authJson(res, 403, {
        error: "FORBIDDEN",
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        missing: code,
      });
    }
    next();
  };
}

export function requireAnyPerm(...codes: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return authJson(res, 401, {
        error: "UNAUTHENTICATED",
        code: "UNAUTHENTICATED",
        message: "Authentication required. Please log in again.",
      });
    }
    const perms = req.user.permissions || [];
    const ok = codes.some((c) => perms.includes(c));
    if (!ok) {
      return authJson(res, 403, {
        error: "FORBIDDEN",
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        missingAnyOf: codes,
      });
    }
    next();
  };
}

export function getBrandScopeWhere(req: AuthRequest) {
  const u = req.user;
  if (!u) return {};
  return u.allowAllBrands ? {} : { brandId: { in: u.allowedBrandIds } };
}

export function requireBrandAccess() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return authJson(res, 401, {
        error: "UNAUTHENTICATED",
        code: "UNAUTHENTICATED",
        message: "Authentication required. Please log in again.",
      });
    }

    const brandId =
      (req.query.brandId as string | undefined) ||
      (req.body?.brandId as string | undefined);

    if (!brandId) return next();
    if (req.user.allowAllBrands) return next();

    if (!req.user.allowedBrandIds.includes(String(brandId))) {
      return authJson(res, 403, {
        error: "FORBIDDEN",
        code: "FORBIDDEN",
        message: "You do not have access to this brand.",
        brandId,
      });
    }

    next();
  };
}
