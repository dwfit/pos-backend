// apps/web/app/layout.tsx
"use client";

import "./globals.css";
import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authStore } from "@/lib/auth-store";
import { clearTokens } from "@/lib/http";
import { apiFetch } from "@/lib/api";

/* ---------------------------- types ---------------------------- */

type Brand = { id: string; name: string; code?: string | null };

type SessionResponse = {
  user: {
    sub: string;
    email: string;
    permissions: string[];
    allowAllBrands: boolean;
    allowedBrandIds: string[];
    roleName?: string | null; // "Admin"
    role?: string | null; // "ADMIN"
  };
  brands: Brand[];
};

/* ---------------------------- RBAC helpers ---------------------------- */

function isAdmin(session: SessionResponse | null) {
  const appRole = (session?.user?.role || "").toUpperCase();
  const roleName = (session?.user?.roleName || "").toLowerCase();
  return appRole === "ADMIN" || roleName === "admin";
}

function hasPerm(perms: string[], code?: string) {
  if (!code) return true;
  return perms.includes(code);
}

function hasAnyPerm(perms: string[], codes: string[]) {
  return codes.some((c) => perms.includes(c));
}

/* ------------------------------ nav config (permissions-based) ------------------------------ */

type NavChild = { href: string; label: string; perm: string };

type NavItem =
  | { href: string; label: string; anyPerms: string[]; children?: never }
  | { href: string; label: string; anyPerms: string[]; children: NavChild[] };

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    anyPerms: [
      "dashboard.general",
      "dashboard.branches",
      "dashboard.inventory",
      "dashboard.callcenter",
    ],
  },
  {
    href: "/orders",
    label: "Orders",
    anyPerms: ["orders.read", "orders.manage", "orders.tags.manage"],
  },
  {
    href: "/reports",
    label: "Reports",
    anyPerms: [
      "reports.sales.view",
      "reports.costAnalysis.view",
      "reports.inventoryControl.view",
    ],
  },
  { href: "/callcenter", label: "Call Center", anyPerms: ["dashboard.callcenter"] },
  {
    href: "/customers",
    label: "Customers",
    anyPerms: ["customers.read", "customers.manage", "customers.insights.read"],
  },
  {
    href: "/manage",
    label: "Manage",
    anyPerms: [
      "menu.manage",
      "branches.manage",
      "devices.manage",
      "users.manage",
      "settings.manage",
      "taxes.manage",
      "discounts.manage",
    ],
    children: [
      { href: "/menu", label: "Menu Management", perm: "menu.manage" },
      { href: "/branches", label: "Branches", perm: "branches.manage" },
      { href: "/devices", label: "Devices", perm: "devices.manage" },
      { href: "/users", label: "Users", perm: "users.manage" },
      { href: "/roles", label: "User Roles", perm: "users.manage" },
      { href: "/general", label: "General Settings", perm: "settings.manage" },
    ],
  },
  {
    href: "/inventory",
    label: "Inventory",
    anyPerms: [
      "inventory.items.read",
      "inventory.items.manage",
      "inventory.counts.create",
    ],
  },
  {
    href: "/marketing",
    label: "Marketing",
    anyPerms: ["discounts.manage"],
    children: [
      { href: "/marketing/loyalty", label: "Loyalty", perm: "customers.loyalty.manage" },
      { href: "/marketing/gift-cards", label: "Gift Cards", perm: "customers.houseAccount.manage" },
      { href: "/marketing/discounts", label: "Discounts", perm: "discounts.manage" },
      { href: "/marketing/promotions", label: "Promotions", perm: "menu.manage" },
      { href: "/marketing/timed-offer", label: "Timed Offer", perm: "menu.manage" },
      { href: "/marketing/coupons", label: "Coupons", perm: "menu.manage" },
    ],
  },
  { href: "/integrations", label: "Integrations", anyPerms: ["settings.manage"] },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

/* -------------------------------- sidebar -------------------------------- */

function Sidebar({
  open,
  onClose,
  permissions,
  admin,
}: {
  open: boolean;
  onClose: () => void;
  permissions: string[];
  admin: boolean;
}) {
  const pathname = usePathname();
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    NAV.forEach((item) => {
      if ("children" in item && item.children?.length) {
        const anyChildActive = item.children.some((ch) => isActive(pathname, ch.href));
        next[item.href] = anyChildActive || openParents[item.href] || false;
      }
    });
    setOpenParents((prev) => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleParent = (href: string) =>
    setOpenParents((prev) => ({ ...prev, [href]: !prev[href] }));

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/30 lg:hidden transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={[
          "fixed z-40 top-0 bottom-0 w-72",
          "bg-white border-r border-slate-200",
          "px-4 py-4",
          "transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0",
        ].join(" ")}
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
          {NAV.map((item) => {
            const hasChildren = "children" in item && !!item.children?.length;

            const parentVisible = admin ? true : hasAnyPerm(permissions, item.anyPerms);
            if (!parentVisible) return null;

            if (!hasChildren) {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                    active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                  onClick={onClose}
                >
                  <span className={["size-1.5 rounded-full", active ? "bg-white" : "bg-slate-300"].join(" ")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            }

            const visibleChildren = admin
              ? item.children!
              : item.children!.filter((ch) => hasPerm(permissions, ch.perm));

            if (visibleChildren.length === 0) return null;

            const parentActive =
              isActive(pathname, item.href) || visibleChildren.some((ch) => isActive(pathname, ch.href));

            const expanded = !!openParents[item.href];

            return (
              <div key={item.href} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleParent(item.href)}
                  className={[
                    "w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors",
                    parentActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                  aria-expanded={expanded}
                  aria-controls={`section-${item.href}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={["size-1.5 rounded-full", parentActive ? "bg-white" : "bg-slate-300"].join(" ")} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <svg
                    className={[
                      "size-4 transition-transform",
                      expanded ? "rotate-90" : "rotate-0",
                      parentActive ? "text-white" : "text-slate-500",
                    ].join(" ")}
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
                    expanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="mt-1 space-y-1 pl-6">
                    {visibleChildren.map((child) => {
                      const activeChild = isActive(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={[
                            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                            activeChild ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                          ].join(" ")}
                          onClick={onClose}
                        >
                          <span className={["size-1.5 rounded-full", activeChild ? "bg-white" : "bg-slate-300"].join(" ")} />
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

/* ------------------------- page title helper ------------------------- */

function flattenNav(items: NavItem[]): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [];
  items.forEach((i) => {
    out.push({ href: i.href, label: i.label });
    if ("children" in i && i.children?.length) {
      out.push(...i.children.map((c) => ({ href: c.href, label: c.label })));
    }
  });
  return out;
}

/* ------------------------- session expired banner (keep as-is) ------------------------- */

function SessionExpiredBanner() {
  const router = useRouter();

  const [sessionExpired, setSessionExpired] = useState(
    !!authStore.getState().sessionExpired
  );
  const [message, setMessage] = useState(authStore.getState().message || "");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const s = authStore.getState();
    setSessionExpired(!!s.sessionExpired);
    setMessage(s.message || "");

    const unsubscribe = authStore.subscribe(() => {
      const next = authStore.getState();
      setSessionExpired(!!next.sessionExpired);
      setMessage(next.message || "");
    });

    return unsubscribe;
  }, []);

  function handleLogin() {
    clearTokens();
    authStore.reset();

    const next = typeof window !== "undefined" ? window.location.pathname : "/";
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  useEffect(() => {
    if (!sessionExpired) return;

    setCountdown(5);

    const interval = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);

    const timeout = setTimeout(() => {
      handleLogin();
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExpired]);

  if (!sessionExpired) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-3">
      <div className="mx-auto max-w-7xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold">Session expired</div>
          <div>
            {message || "Session has expired. Please log in again."}{" "}
            <span className="opacity-80">(redirecting in {countdown}s)</span>
          </div>
        </div>

        <button
          onClick={handleLogin}
          className="rounded-lg bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Login again
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- layout --------------------------------- */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // brand dropdown state
  const [selectedBrandId, setSelectedBrandId] = useState<string>("ALL");

  const [sessionExpired, setSessionExpired] = useState(
    !!authStore.getState().sessionExpired
  );

  useEffect(() => {
    const unsubscribe = authStore.subscribe(() => {
      setSessionExpired(!!authStore.getState().sessionExpired);
    });
    return unsubscribe;
  }, []);

  const pageTitle = useMemo(() => {
    const flat = flattenNav(NAV);
    const exact = flat.find((n) => n.href === pathname);
    if (exact) return exact.label;

    const prefix =
      flat.find((n) => n.href !== "/" && pathname?.startsWith(n.href)) ?? {
        label: "Overview",
      };
    return prefix.label;
  }, [pathname]);

  const isAuthPage = pathname === "/login";

  // ✅ load /session (do not call on /login)
  useEffect(() => {
    if (isAuthPage) return;

    let mounted = true;

    (async () => {
      try {
        setSessionLoading(true);
        const data = await apiFetch<SessionResponse>("/session", { method: "GET" });
        if (!mounted) return;

        setSession(data);

        // init brand selection
        const allowAll = data.user.allowAllBrands;
        const saved =
          typeof window !== "undefined" ? localStorage.getItem("selectedBrandId") : null;

        let next = saved || (allowAll ? "ALL" : data.brands[0]?.id || "ALL");
        const visible = new Set(data.brands.map((b) => b.id));

        if (!allowAll && next === "ALL") next = data.brands[0]?.id || "ALL";
        if (next !== "ALL" && !visible.has(next)) {
          next = allowAll ? "ALL" : data.brands[0]?.id || "ALL";
        }

        setSelectedBrandId(next);

        // Persist + expose + notify (so pages can react)
        if (typeof window !== "undefined") {
          localStorage.setItem("selectedBrandId", next);
          (window as any).__brandId = next;
          window.dispatchEvent(new CustomEvent("brand:changed", { detail: { brandId: next } }));
          console.log("✅ Brand init:", next);
        }
      } catch (e) {
        console.warn("Failed to load session:", e);
      } finally {
        if (mounted) setSessionLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isAuthPage]);

  // ✅ whenever brand changes: persist + expose + notify
  useEffect(() => {
    if (typeof window === "undefined") return;

    localStorage.setItem("selectedBrandId", selectedBrandId);
    (window as any).__brandId = selectedBrandId;
    window.dispatchEvent(new CustomEvent("brand:changed", { detail: { brandId: selectedBrandId } }));

    console.log("✅ Brand changed:", selectedBrandId);
  }, [selectedBrandId]);

  async function handleLogout() {
    try {
      await fetch("http://127.0.0.1:4000/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // ignore
    }
    document.cookie = "role=; Max-Age=0; path=/";
    window.location.href = "/login";
  }

  if (isAuthPage) {
    return (
      <html lang="en">
        <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
      </html>
    );
  }

  const permissions = session?.user.permissions || [];
  const brands = session?.brands || [];
  const allowAllBrands = session?.user.allowAllBrands ?? true;
  const admin = isAdmin(session);

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <SessionExpiredBanner />

        <div className={sessionExpired ? "pt-16" : ""}>
          <div className="lg:grid lg:grid-cols-[288px_minmax(0,1fr)] min-h-screen">
            <Sidebar
              open={open}
              onClose={() => setOpen(false)}
              permissions={permissions}
              admin={admin}
            />

            <div className="flex min-h-screen flex-col">
              <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
                <div className="flex items-center gap-3 px-4 py-3">
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

                  <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center gap-2">
                      <span className="text-xs text-slate-500">Brand</span>
                      <select
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        value={selectedBrandId}
                        onChange={(e) => setSelectedBrandId(e.target.value)}
                        disabled={sessionLoading || brands.length === 0}
                        title={sessionLoading ? "Loading brands..." : ""}
                      >
                        {allowAllBrands && <option value="ALL">All brands</option>}
                        {brands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                            {b.code ? ` (${b.code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

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

                <div className="px-4 pb-3 md:hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Brand</span>
                    <select
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      value={selectedBrandId}
                      onChange={(e) => setSelectedBrandId(e.target.value)}
                      disabled={sessionLoading || brands.length === 0}
                    >
                      {allowAllBrands && <option value="ALL">All brands</option>}
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.code ? ` (${b.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </header>

              <main className="px-4 py-6 lg:px-6">
                <div className="mx-auto max-w-7xl">{children}</div>
              </main>

              <footer className="mt-auto border-t border-slate-200 bg-white/60">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 text-xs text-slate-500 lg:px-6">
                  <span>
                    Develompent Works Food Company © {new Date().getFullYear()}
                  </span>
                  <span className="hidden sm:inline">
                    By: {process.env.NEXT_PUBLIC_BUILD_ID ?? "IT Department"}
                  </span>
                </div>
              </footer>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
