'use client';

import './globals.css';
import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ---------------------------- roles & helpers ---------------------------- */

type Role = 'ADMIN' | 'MANAGER' | 'AGENT';

function getRoleFromCookie(): Role | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)role=([^;]+)/);
  if (!match) return null;
  return match[1] as Role;
}

function canSee(role: Role | null, allowed?: Role[]) {
  // If no roles specified, everyone can see
  if (!allowed || allowed.length === 0) return true;
  // If we don't know role yet (first render), allow to avoid flicker
  if (!role) return true;
  return allowed.includes(role);
}

/* ------------------------------ nav config ------------------------------ */

type NavChild = { href: string; label: string; roles?: Role[] };

type NavItem =
  | { href: string; label: string; roles?: Role[]; children?: never }
  | { href: string; label: string; roles?: Role[]; children: NavChild[] };

// Adjust roles as you like
const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', roles: ['ADMIN', 'MANAGER', 'AGENT'] },
  { href: '/orders', label: 'Orders', roles: ['ADMIN', 'MANAGER', 'AGENT'] },
  { href: '/reports', label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
  { href: '/callcenter', label: 'Call Center', roles: ['ADMIN', 'AGENT'] },
  { href: '/customers', label: 'Customers', roles: ['ADMIN', 'MANAGER', 'AGENT'] },

  {
    href: '/',
    label: 'Manage',
    roles: ['ADMIN', 'MANAGER'],
    children: [
      { href: '/menu', label: 'Menu Management', roles: ['ADMIN', 'MANAGER'] },
      { href: '/branches', label: 'Branches', roles: ['ADMIN', 'MANAGER'] },
      { href: '/devices', label: 'Devices', roles: ['ADMIN'] },
      { href: '/users', label: 'Users', roles: ['ADMIN'] },
      { href: '/roles', label: 'User Rolls', roles: ['ADMIN'] },
      { href: '/general', label: 'General Settings', roles: ['ADMIN'] },
    ],
  },

  { href: '/inventory', label: 'Inventory', roles: ['ADMIN', 'MANAGER'] },

  // 🔹 Marketing with sub menu
  {
    href: '/marketing',
    label: 'Marketing',
    roles: ['ADMIN', 'MANAGER'],
    children: [
      { href: '/marketing/loyalty', label: 'Loyalty', roles: ['ADMIN', 'MANAGER'] },
      { href: '/marketing/gift-cards', label: 'Gift Cards', roles: ['ADMIN', 'MANAGER'] },
      { href: '/marketing/discounts', label: 'Discounts', roles: ['ADMIN', 'MANAGER'] },
      { href: '/marketing/promotions', label: 'Promotions', roles: ['ADMIN', 'MANAGER'] },
      { href: '/marketing/timed-offer', label: 'Timed Offer', roles: ['ADMIN', 'MANAGER'] },
      { href: '/marketing/coupons', label: 'Coupons', roles: ['ADMIN', 'MANAGER'] },
    ],
  },

  { href: '/integrations', label: 'Integrations', roles: ['ADMIN'] },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || (href !== '/' && pathname.startsWith(href));
}

/* -------------------------------- sidebar -------------------------------- */

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    setRole(getRoleFromCookie());
  }, []);

  // Auto-expand any parent that contains the current route
  useEffect(() => {
    const next: Record<string, boolean> = {};
    NAV.forEach(item => {
      if ('children' in item && item.children?.length) {
        const anyChildActive = item.children.some(ch => isActive(pathname, ch.href));
        next[item.href] = anyChildActive || openParents[item.href] || false;
      }
    });
    setOpenParents(prev => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleParent = (href: string) =>
    setOpenParents(prev => ({ ...prev, [href]: !prev[href] }));

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className={`fixed inset-0 z-30 bg-black/30 lg:hidden transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={[
          'fixed z-40 top-0 bottom-0 w-72',
          'bg-white border-r border-slate-200',
          'px-4 py-4',
          'transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:translate-x-0',
        ].join(' ')}
        aria-label="Sidebar"
      >
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="size-8 rounded-xl bg-slate-900" />
          <div>
            <div className="text-sm font-semibold tracking-tight">POS Admin</div>
            <div className="text-[11px] text-slate-500">Control Center</div>
          </div>
        </div>

        <nav className="mt-5 space-y-1">
          {NAV.map(item => {
            const hasChildren = 'children' in item && !!item.children?.length;

            if (!hasChildren) {
              if (!canSee(role, item.roles)) return null;

              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                    active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}
                  onClick={onClose}
                >
                  <span
                    className={[
                      'size-1.5 rounded-full',
                      active ? 'bg-white' : 'bg-slate-300',
                    ].join(' ')}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            }

            // Parent with children (collapsible)
            const visibleChildren = item.children!.filter(ch => canSee(role, ch.roles));

            // If parent itself is not visible AND no visible children, skip entirely
            if (!canSee(role, item.roles) && visibleChildren.length === 0) return null;

            const parentActive =
              isActive(pathname, item.href) ||
              visibleChildren.some(ch => isActive(pathname, ch.href));

            const expanded = !!openParents[item.href];

            return (
              <div key={item.href} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleParent(item.href)}
                  className={[
                    'w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors',
                    parentActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}
                  aria-expanded={expanded}
                  aria-controls={`section-${item.href}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        'size-1.5 rounded-full',
                        parentActive ? 'bg-white' : 'bg-slate-300',
                      ].join(' ')}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <svg
                    className={[
                      'size-4 transition-transform',
                      expanded ? 'rotate-90' : 'rotate-0',
                      parentActive ? 'text-white' : 'text-slate-500',
                    ].join(' ')}
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M7 5l6 5-6 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div
                  id={`section-${item.href}`}
                  className={`overflow-hidden transition-[max-height,opacity] duration-200 ${
                    expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="mt-1 space-y-1 pl-6">
                    {visibleChildren.map(child => {
                      const activeChild = isActive(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={[
                            'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                            activeChild
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-700 hover:bg-slate-100',
                          ].join(' ')}
                          onClick={onClose}
                        >
                          <span
                            className={[
                              'size-1.5 rounded-full',
                              activeChild ? 'bg-white' : 'bg-slate-300',
                            ].join(' ')}
                          />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto hidden lg:block" />
      </aside>
    </>
  );
}

/* ------------------------- page title helper (same) ------------------------- */

function flattenNav(items: NavItem[]): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [];
  items.forEach(i => {
    out.push({ href: i.href, label: i.label });
    if ('children' in i && i.children?.length) out.push(...i.children);
  });
  return out;
}

/* --------------------------------- layout --------------------------------- */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const pageTitle = useMemo(() => {
    const flat = flattenNav(NAV);
    const exact = flat.find(n => n.href === pathname);
    if (exact) return exact.label;
    const prefix =
      flat.find(n => n.href !== '/' && pathname?.startsWith(n.href)) ?? {
        label: 'Overview',
      };
    return prefix.label;
  }, [pathname]);

  const isAuthPage = pathname === '/login';

  async function handleLogout() {
    try {
      await fetch('http://127.0.0.1:4000/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    // Clear role cookie (just in case) & go to login
    document.cookie = 'role=; Max-Age=0; path=/';
    window.location.href = '/login';
  }

  // For /login, show a blank layout (no sidebar/topbar/footer)
  if (isAuthPage) {
    return (
      <html lang="en">
        <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <div className="lg:grid lg:grid-cols-[288px_minmax(0,1fr)] min-h-screen">
          {/* Sidebar (mobile drawer + desktop fixed) */}
          <Sidebar open={open} onClose={() => setOpen(false)} />

          {/* Main column */}
          <div className="flex min-h-screen flex-col">
            {/* Top bar */}
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Mobile hamburger */}
                <button
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
                  onClick={() => setOpen(true)}
                  aria-label="Open navigation"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 6h16M4 12h16M4 18h16"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                <div className="flex-1">
                  <h1 className="text/base font-semibold leading-none tracking-tight">
                    {pageTitle}
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
                    Manage your POS operations, catalog, and integrations.
                  </p>
                </div>

                {/* Top bar actions */}
                <div className="flex items-center gap-2">
                  <button
                    className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50 md:inline-flex"
                    onClick={() => location.reload()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 12a8 8 0 1 1-2.343-5.657L20 8M20 8V4m0 4h-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Refresh
                  </button>

                  <button
                    className="h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </div>
              </div>
            </header>

            {/* Page content */}
            <main className="px-4 py-6 lg:px-6">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>

            {/* Footer */}
            <footer className="mt-auto border-t border-slate-200 bg-white/60">
              <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-xs text-slate-500 lg:px-6">
                <span>
                  Develompent Works Food Company © {new Date().getFullYear()}
                </span>
                <span className="hidden sm:inline">
                  By: {process.env.NEXT_PUBLIC_BUILD_ID ?? 'IT Department'}
                </span>
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
