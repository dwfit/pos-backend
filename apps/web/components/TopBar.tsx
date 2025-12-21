"use client";

import { useSession } from "@/lib/session-context";

export default function TopBar() {
  const {
    brands,
    allowAllBrands,
    selectedBrandId,
    setSelectedBrandId,
    loading,
    session,
  } = useSession();

  if (loading) {
    return (
      <header className="h-14 border-b bg-white flex items-center px-4">
        <div className="text-sm text-gray-500">Loading…</div>
      </header>
    );
  }

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="font-semibold">Dashboard</div>

        <select
          className="border rounded px-3 py-2 text-sm"
          value={selectedBrandId}
          onChange={(e) => setSelectedBrandId(e.target.value)}
        >
          {allowAllBrands && <option value="ALL">All brands</option>}
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}{b.code ? ` (${b.code})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="text-sm text-gray-600">
        {session?.user.email}
      </div>
    </header>
  );
}
