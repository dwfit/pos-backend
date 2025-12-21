"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDEBAR_TREE } from "@/lib/sidebar-tree";
import { useSession } from "@/lib/session-context";

function hasAny(perms: string[], codes: string[]) {
  return codes.some((c) => perms.includes(c));
}
function hasPerm(perms: string[], code?: string) {
  if (!code) return true;
  return perms.includes(code);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { permissions, loading } = useSession();

  if (loading) {
    return (
      <aside className="w-64 border-r bg-white p-4">
        <div className="text-sm text-gray-500">Loading…</div>
      </aside>
    );
  }

  return (
    <aside className="w-64 border-r bg-white p-4">
      <div className="text-lg font-semibold mb-4">POS Admin</div>

      <nav className="space-y-4">
        {SIDEBAR_TREE.filter((g) => hasAny(permissions, g.showIfAny)).map((g) => {
          const visibleChildren = g.children.filter((c) => hasPerm(permissions, c.showIf));
          if (!visibleChildren.length) return null;

          return (
            <div key={g.label}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {g.label}
              </div>

              <div className="space-y-1">
                {visibleChildren.map((c) => {
                  const active = c.href && (pathname === c.href || pathname.startsWith(c.href + "/"));
                  return (
                    <Link
                      key={c.href}
                      href={c.href || "#"}
                      className={[
                        "block rounded px-3 py-2 text-sm",
                        active ? "bg-black text-white" : "hover:bg-gray-100 text-gray-900",
                      ].join(" ")}
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
