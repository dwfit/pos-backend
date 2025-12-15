// web/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

// Paths that don't need auth
const PUBLIC_PATHS = ['/login', '/favicon.ico', '/_next', '/api'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // ✅ Use the same cookie name as in apps/api/src/routes/auth.ts
  const token = req.cookies.get('pos_token')?.value;

  // If no token, force to /login with redirectTo
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirectTo', pathname || '/');
    return NextResponse.redirect(loginUrl);
  }

  // Token exists → allow
  return NextResponse.next();
}

// Where this middleware runs
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
