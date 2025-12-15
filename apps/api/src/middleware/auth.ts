// apps/api/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthPayload {
  sub: string;
  email: string;
  role?: string | null;        // appRole from JWT
  roleName?: string | null;    // human readable role name (optional)
  branchId?: string | null;    // POS primary branch
  permissions?: string[];      // POS + web permissions
}

export interface AuthRequest extends Request {
  user?: AuthPayload & { permissions: string[] };
}

/**
 * Try to extract JWT token from:
 *  - Authorization: Bearer <token>
 *  - cookies.pos_token / cookies.token (if cookie-parser is enabled)
 *  - raw Cookie header (manual parse, so it works even without cookie-parser)
 */
function extractToken(req: Request): string | null {
  // 1) Authorization: Bearer ...
  const header = req.headers.authorization;
  const bearer =
    header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (bearer) return bearer;

  // 2) Cookie parsed by cookie-parser
  const cookies = (req as any).cookies || {};
  const cookieToken = cookies.pos_token || cookies.token || null;
  if (cookieToken) return cookieToken;

  // 3) Raw Cookie header (in case cookie-parser is not wired)
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const parts = cookieHeader.split(';').map((p) => p.trim());
    for (const part of parts) {
      if (part.startsWith('pos_token=')) {
        return decodeURIComponent(part.substring('pos_token='.length));
      }
      if (part.startsWith('token=')) {
        return decodeURIComponent(part.substring('token='.length));
      }
    }
  }

  return null;
}

/**
 * Require a valid JWT in cookie "pos_token" or Authorization: Bearer header.
 * It also normalizes `req.user.permissions` to a string[] so API routes
 * (like /pos/config) can reliably check role-based authorities.
 */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = extractToken(req);

  if (!token) {
    console.warn('requireAuth: no token found', {
      cookieKeys: Object.keys((req as any).cookies || {}),
      authorization: req.headers.authorization,
      cookieHeader: req.headers.cookie,
    });
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });
  }

  try {
    // Allow any shape – we’ll normalize it below.
    const decoded: any = jwt.verify(token, config.jwtSecret);

    // 🔍 TEMP: log the raw payload once so we can see its real shape
    console.log('🔍 Decoded JWT payload:', decoded);

    // Try multiple possible keys for id / sub
    const sub: string =
      decoded.sub ||
      decoded.id ||
      decoded.userId ||
      decoded.user_id ||
      decoded.uid ||
      (decoded.user && (decoded.user.id || decoded.user.userId)) ||
      '';

    // Email
    const email: string =
      decoded.email ||
      (decoded.user && decoded.user.email) ||
      '';

    // Role + roleName
    const role: string | null =
      decoded.role ||
      decoded.appRole ||
      (decoded.user && decoded.user.role) ||
      null;

    const roleName: string | null =
      decoded.roleName ||
      (decoded.user && decoded.user.roleName) ||
      null;

    // Branch id – try a few possible keys
    const branchId: string | null =
      decoded.branchId ||
      decoded.branch_id ||
      (decoded.user && (decoded.user.branchId || decoded.user.branch_id)) ||
      null;

    // Permissions: try several common locations
    let permissions: string[] = [];

    if (Array.isArray(decoded.permissions)) {
      permissions = decoded.permissions;
    } else if (Array.isArray(decoded.perms)) {
      permissions = decoded.perms;
    } else if (decoded.user && Array.isArray(decoded.user.permissions)) {
      permissions = decoded.user.permissions;
    } else if (
      decoded.role &&
      decoded.role.permissions &&
      Array.isArray(decoded.role.permissions)
    ) {
      permissions = decoded.role.permissions;
    }

    const payload: AuthPayload & { permissions: string[] } = {
      sub,
      email,
      role,
      roleName,
      branchId,
      permissions,
    };

    req.user = payload;

    console.log('✅ requireAuth user:', {
      sub: payload.sub,
      branchId: payload.branchId,
      permissionsCount: payload.permissions.length,
    });

    return next();
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      console.error('requireAuth error (expired token):', err);
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',        // 👈 this is what web/POS check
        code: 'TOKEN_EXPIRED',
        message: 'Session has expired. Please log in again.',
      });
    }

    console.error('requireAuth error (invalid token):', err);
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      code: 'INVALID_TOKEN',
      message: 'Invalid token.',
    });
  }
}

/**
 * Require that the current user has one of the given roles.
 * Usage: router.get('/devices', requireAuth, requireRole('ADMIN'), handler)
 */
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }

    // If no roles provided, just pass through
    if (!roles.length) return next();

    const userRole = req.user.role;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }

    return next();
  };
}
