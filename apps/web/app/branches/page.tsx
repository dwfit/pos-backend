"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";

type BranchRow = {
  id: string;
  name: string;
  reference: string;
  taxGroup: string | null;
  createdAt: string;
};

type CreatePayload = {
  name: string;
  nameLocalized?: string;
  reference?: string;
  code?: string;
  taxGroup?: string | null;

  branchTaxRegistrationName?: string;
  branchTaxNumber?: string;

  openingFrom?: string;
  openingTo?: string;
  inventoryEndOfDay?: string;

  phone?: string;
  address?: string;

  streetName?: string;
  buildingNumber?: string;
  additionalNumber?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  crNumber?: string;
  latitude?: string;
  longitude?: string;

  displayApp?: boolean;
  receiptHeader?: string;
  receiptFooter?: string;
};

type Filters = {
  name?: string;
  reference?: string;
  taxGroup?: string;
  tags?: string;
  code?: string;
  city?: string;
  createdFrom?: string;
  createdTo?: string;
};

export default function BranchesPage() {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);             // create modal
  const [filterOpen, setFilterOpen] = useState(false); // filter modal
  const [form, setForm] = useState<CreatePayload>({ name: "", taxGroup: "" as any });
  const [filters, setFilters] = useState<Filters>({});
  const [taxGroups, setTaxGroups] = useState<string[]>([]);
  const [taxGroupsLoading, setTaxGroupsLoading] = useState(false);
  const router = useRouter();

  const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

  // 🔢 pagination (client-side)
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  // 🔍 search (name / reference)
  const [search, setSearch] = useState<string>("");

  // 🔹 Load tax groups from API once
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setTaxGroupsLoading(true);
        const res = await fetch(`${api}/branches/tax-groups`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!abort) setTaxGroups(Array.isArray(j?.data) ? j.data : []);
      } catch (e) {
        console.warn("Failed to load tax groups", e);
        if (!abort) setTaxGroups([]);
      } finally {
        if (!abort) setTaxGroupsLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [api]);

  // setters
  const set = (k: keyof CreatePayload, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setFilter = (k: keyof Filters, v: any) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  // Build query string when filters change
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.name) p.set("name", filters.name);
    if (filters.reference) p.set("reference", filters.reference);
    if (filters.taxGroup) p.set("taxGroup", filters.taxGroup);
    if (filters.tags) p.set("tags", filters.tags);
    if (filters.code) p.set("code", filters.code);
    if (filters.city) p.set("city", filters.city);
    if (filters.createdFrom) p.set("createdFrom", filters.createdFrom);
    if (filters.createdTo) p.set("createdTo", filters.createdTo);
    return p.toString();
  }, [filters]);

  const load = async () => {
    setLoading(true);
    const url = qs ? `${api}/branches?${qs}` : `${api}/branches`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    setRows(json.data ?? []);
    setPage(1); // reset to first page whenever data/filters change
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const save = async () => {
    if (!form.name?.trim()) return alert("Name is required");
    const res = await fetch(`${api}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert("Failed to save branch" + (j?.error ? `: ${j.error}` : ""));
      return;
    }

    const newId = j?.data?.id ?? j?.id ?? j?.branch?.id ?? null;

    setOpen(false);
    setForm({ name: "", taxGroup: "" as any });

    if (newId) {
      router.push(`/branches/${newId}`);
    } else {
      await load();
    }
  };

  const genRef = () => {
    const n = rows.length + 1;
    const c = "B" + String(n).padStart(2, "0");
    set("code", c);
    set("reference", c);
  };

  const goRow = (id: string) => router.push(`/branches/${id}`);

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  /* ------------ search + pagination calculations ------------- */

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((b) => {
      const name = (b.name || "").toLowerCase();
      const reference = (b.reference || "").toLowerCase();
      return name.includes(term) || reference.includes(term);
    });
  }, [rows, search]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex =
    totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex =
    totalRows === 0
      ? 0
      : Math.min(currentPage * pageSize, totalRows);

  const paginatedRows = useMemo(
    () =>
      filteredRows.slice(
        (currentPage - 1) * pageSize,
        (currentPage - 1) * pageSize + pageSize
      ),
    [filteredRows, currentPage]
  );

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  // reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div className="p-6 space-y-6 min-h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold"></h1>
        <button
          className="px-4 py-2 rounded-lg bg-black text-white hover:bg-neutral-800"
          onClick={() => setOpen(true)}
        >
          Create Branch
        </button>
      </div>

      {/* Card with flex so footer sticks to bottom */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow border border-neutral-200 dark:border-neutral-800 flex flex-col flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="font-medium">All</div>
          <div className="flex items-center gap-2">
            {/* 🔍 Search input */}
            <input
              type="text"
              className="h-9 w-56 rounded-md border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-800 shadow-inner outline-none transition focus:border-neutral-500 focus:bg-white focus:ring-2 focus:ring-neutral-200"
              placeholder="Search name or reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="flex items-center gap-2 px-3 py-1 border rounded-md text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setFilterOpen(true)}
            >
              <Filter size={16} /> Filter
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {Object.keys(filters).length > 0 && (
          <div className="px-4 py-2 flex flex-wrap gap-2 text-xs">
            {Object.entries(filters).map(([k, v]) =>
              v ? (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 border rounded-full px-2 py-1"
                >
                  <span className="capitalize">{k}</span>:{" "}
                  <span>{String(v)}</span>
                  <button
                    className="hover:text-red-600"
                    onClick={() => setFilter(k as keyof Filters, undefined)}
                    aria-label={`Remove ${k}`}
                  >
                    ×
                  </button>
                </span>
              ) : null
            )}
            <button className="ml-2 underline" onClick={() => setFilters({})}>
              Clear all
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-gray-500 flex-1">
            Loading…
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-800 text-left text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Tax Group</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => goRow(b.id)}
                    className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") && goRow(b.id)
                    }
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">{b.name}</td>
                    <td className="px-4 py-3">{b.reference}</td>
                    <td className="px-4 py-3">{b.taxGroup ?? "—"}</td>
                    <td className="px-4 py-3">{fmtDate(b.createdAt)}</td>
                  </tr>
                ))}

                {!loading && !paginatedRows.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No branches found. Try adjusting filters or search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer – sticks to bottom */}
        {!loading && (
          <div className="flex justify-between items-center px-4 py-3 text-xs text-gray-500 border-t border-neutral-200 dark:border-neutral-800">
            <span>
              {totalRows === 0 ? (
                "Showing 0 to 0 out of 0"
              ) : (
                <>
                  Showing{" "}
                  <span className="font-medium">{startIndex}</span> to{" "}
                  <span className="font-medium">{endIndex}</span> out of{" "}
                  <span className="font-medium">{totalRows}</span>
                </>
              )}
            </span>
            <div className="flex gap-2">
              <button
                disabled={!canPrev}
                onClick={() => canPrev && setPage((p) => p - 1)}
                className="rounded-lg border border-neutral-300 px-3 py-1 text-xs text-neutral-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={!canNext}
                onClick={() => canNext && setPage((p) => p + 1)}
                className="rounded-lg bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Create Modal --- */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">Create Branch</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
              {/* Name */}
              <label className="block text-sm">
                Name<span className="text-red-500"> *</span>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                Name Localized
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.nameLocalized || ""}
                  onChange={(e) => set("nameLocalized", e.target.value)}
                />
              </label>

              <div className="grid grid-cols-3 gap-2 items-end">
                <label className="col-span-2 text-sm">
                  Reference
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.reference || ""}
                    onChange={(e) => set("reference", e.target.value)}
                  />
                </label>
                <button
                  className="h-10 rounded-md border hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={genRef}
                  type="button"
                >
                  Generate
                </button>
              </div>

              {/* Optional Code */}
              {form.code ? (
                <label className="block text-sm">
                  Code
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.code}
                    onChange={(e) => set("code", e.target.value)}
                  />
                </label>
              ) : null}

              {/* Tax Group from API */}
              <label className="block text-sm">
                Tax Group
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.taxGroup ?? ""}
                  onChange={(e) => set("taxGroup", e.target.value || null)}
                  disabled={taxGroupsLoading}
                >
                  <option value="">Choose…</option>
                  {taxGroupsLoading && (
                    <option value="" disabled>
                      Loading…
                    </option>
                  )}
                  {!taxGroupsLoading &&
                    taxGroups.map((tg) => (
                      <option key={tg} value={tg}>
                        {tg}
                      </option>
                    ))}
                </select>
              </label>

              {/* Remaining create fields (unchanged) */}
              <label className="block text-sm">
                Branch Tax Registration Name
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.branchTaxRegistrationName || ""}
                  onChange={(e) =>
                    set("branchTaxRegistrationName", e.target.value)
                  }
                />
              </label>
              <label className="block text-sm">
                Branch Tax Number
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.branchTaxNumber || ""}
                  onChange={(e) =>
                    set("branchTaxNumber", e.target.value)
                  }
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  Opening From
                  <input
                    type="time"
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.openingFrom || ""}
                    onChange={(e) => set("openingFrom", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Opening To
                  <input
                    type="time"
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.openingTo || ""}
                    onChange={(e) => set("openingTo", e.target.value)}
                  />
                </label>
              </div>

              <label className="block text-sm">
                Inventory End of Day
                <input
                  type="time"
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.inventoryEndOfDay || ""}
                  onChange={(e) =>
                    set("inventoryEndOfDay", e.target.value)
                  }
                />
              </label>

              <label className="block text-sm">
                Phone
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.phone || ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                Address
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  rows={2}
                  value={form.address || ""}
                  onChange={(e) => set("address", e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  Street Name
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.streetName || ""}
                    onChange={(e) => set("streetName", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Building Number
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.buildingNumber || ""}
                    onChange={(e) => set("buildingNumber", e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  Additional Number
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.additionalNumber || ""}
                    onChange={(e) =>
                      set("additionalNumber", e.target.value)
                    }
                  />
                </label>
                <label className="block text-sm">
                  City
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.city || ""}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  District
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.district || ""}
                    onChange={(e) => set("district", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Postal Code
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.postalCode || ""}
                    onChange={(e) => set("postalCode", e.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  CR Number
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.crNumber || ""}
                    onChange={(e) => set("crNumber", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Latitude
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.latitude || ""}
                    onChange={(e) => set("latitude", e.target.value)}
                  />
                </label>
              </div>

              <label className="block text-sm">
                Longitude
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.longitude || ""}
                  onChange={(e) => set("longitude", e.target.value)}
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.displayApp}
                  onChange={(e) => set("displayApp", e.target.checked)}
                />
                Display App
              </label>

              <label className="block text-sm">
                Receipt Header
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  rows={2}
                  value={form.receiptHeader || ""}
                  onChange={(e) => set("receiptHeader", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Receipt Footer
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  rows={2}
                  value={form.receiptFooter || ""}
                  onChange={(e) => set("receiptFooter", e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-md border"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <button
                className="px-4 py-2 rounded-md bg-black text-white hover:bg-neutral-800"
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Filter Modal --- */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">Filter Branches</h2>
              <button
                onClick={() => setFilterOpen(false)}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
              <label className="block text-sm">
                Name
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.name || ""}
                  onChange={(e) => setFilter("name", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                Reference
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.reference || ""}
                  onChange={(e) => setFilter("reference", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                Tax Group
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.taxGroup || ""}
                  onChange={(e) => setFilter("taxGroup", e.target.value)}
                  disabled={taxGroupsLoading}
                >
                  <option value="">All</option>
                  {taxGroupsLoading && (
                    <option value="" disabled>
                      Loading…
                    </option>
                  )}
                  {!taxGroupsLoading &&
                    taxGroups.map((tg) => (
                      <option key={tg} value={tg}>
                        {tg}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block text-sm">
                Code
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.code || ""}
                  onChange={(e) => setFilter("code", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                City
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.city || ""}
                  onChange={(e) => setFilter("city", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                Tags (comma-separated)
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  placeholder="mall, drive-thru"
                  value={filters.tags || ""}
                  onChange={(e) => setFilter("tags", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                Created From
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.createdFrom || ""}
                  onChange={(e) => setFilter("createdFrom", e.target.value)}
                />
              </label>

              <label className="block text-sm">
                Created To
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.createdTo || ""}
                  onChange={(e) => setFilter("createdTo", e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-between gap-2">
              <button
                className="px-4 py-2 rounded-md border"
                onClick={() => setFilterOpen(false)}
              >
                Close
              </button>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-md border"
                  onClick={() => setFilters({})}
                >
                  Clear
                </button>
                <button
                  className="px-4 py-2 rounded-md bg-black text-white hover:bg-neutral-800"
                  onClick={() => setFilterOpen(false)} // qs change auto-triggers load()
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
