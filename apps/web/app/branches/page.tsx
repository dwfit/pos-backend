"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";

type Brand = { id: string; code: string; name: string; isActive?: boolean };

type BranchRow = {
  id: string;
  name: string;
  reference: string;
  taxGroup: string | null;
  createdAt: string;
};

type CreatePayload = {
  brandId?: string;
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
  brandId?: string;
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
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const [form, setForm] = useState<CreatePayload>({
    brandId: "",
    name: "",
    taxGroup: "" as any,
  });

  const [filters, setFilters] = useState<Filters>({});

  const [taxGroups, setTaxGroups] = useState<string[]>([]);
  const [taxGroupsLoading, setTaxGroupsLoading] = useState(false);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandsError, setBrandsError] = useState<string | null>(null);

  const router = useRouter();
  const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

  // pagination
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  // search
  const [search, setSearch] = useState<string>("");

  /* ----------------------------- helpers ----------------------------- */

  function getToken() {
    if (typeof window === "undefined") return "";
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("pos_token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("access_token") ||
      ""
    );
  }

  async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const token = getToken();
    if (!token) console.warn("No token found for request:", url);

    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      credentials: "include",
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Request failed: ${res.status}`);
    }
    return data as T;
  }

  // ✅ fix: set() was missing
  function set<K extends keyof CreatePayload>(key: K, value: CreatePayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ✅ fix: setFilter() was missing
  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  /* ----------------------------- Load Brands ----------------------------- */
  useEffect(() => {
    let abort = false;

    (async () => {
      try {
        setBrandsLoading(true);
        setBrandsError(null);

        const token = getToken();

        const res = await fetch(`${api}/brands?simple=1&active=1`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const text = await res.text().catch(() => "");
        if (!res.ok) throw new Error(`GET /brands failed: ${res.status} ${text}`);

        const j = text ? JSON.parse(text) : null;

        const items: Brand[] = Array.isArray(j)
          ? j
          : Array.isArray(j?.data)
            ? j.data
            : [];

        if (!abort) setBrands(items);
      } catch (e: any) {
        console.warn("Failed to load brands", e);
        if (!abort) {
          setBrands([]);
          setBrandsError(e?.message || "Failed to load brands");
        }
      } finally {
        if (!abort) setBrandsLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [api]);

  /* ----------------------------- Load Tax Groups (AUTH) ----------------------------- */
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setTaxGroupsLoading(true);
        const j = await fetchJson<{ data: string[] }>(`${api}/branches/tax-groups`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  /* ----------------------------- Query string ----------------------------- */
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.brandId) p.set("brandId", filters.brandId);
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

  /* ----------------------------- Load Branches (AUTH) ----------------------------- */
  const load = async () => {
    setLoading(true);
    try {
      const url = qs ? `${api}/branches?${qs}` : `${api}/branches`;
      const json = await fetchJson<{ data: BranchRow[] }>(url);
      setRows(json.data ?? []);
      setPage(1);
    } catch (e) {
      console.error("Load branches failed:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  /* ----------------------------- Save ----------------------------- */
  const save = async () => {
    if (!form.brandId) return alert("Brand is required");
    if (!form.name?.trim()) return alert("Name is required");

    try {
      const res = await fetchJson<any>(`${api}/branches`, {
        method: "POST",
        body: JSON.stringify(form),
      });

      const newId = res?.data?.id ?? res?.id ?? res?.branch?.id ?? res?.id ?? null;

      setOpen(false);
      setForm({ brandId: "", name: "", taxGroup: "" as any });

      if (newId) router.push(`/branches/${newId}`);
      else await load();
    } catch (e: any) {
      alert(`Failed to save branch: ${e?.message || "Unknown error"}`);
    }
  };

  /* ----------------------------- Generate Reference (SERVER) ----------------------------- */
  const genRef = async () => {
    if (!form.brandId) return alert("Select Brand first");

    try {
      const j = await fetchJson<{ data: { reference: string } }>(
        `${api}/branches/next-reference?brandId=${encodeURIComponent(String(form.brandId))}`
      );

      const ref = j?.data?.reference || "";
      if (!ref) return alert("Failed to generate reference");

      set("code", ref);
      set("reference", ref);
    } catch (e: any) {
      alert(`Generate failed: ${e?.message || "Unknown error"}`);
    }
  };

  const goRow = (id: string) => router.push(`/branches/${id}`);

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

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
  const startIndex = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = totalRows === 0 ? 0 : Math.min(currentPage * pageSize, totalRows);

  const paginatedRows = useMemo(
    () =>
      filteredRows.slice(
        (currentPage - 1) * pageSize,
        (currentPage - 1) * pageSize + pageSize
      ),
    [filteredRows, currentPage]
  );

  useEffect(() => setPage(1), [search]);

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

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow border border-neutral-200 dark:border-neutral-800 flex flex-col flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="font-medium">All</div>
          <div className="flex items-center gap-2">
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

        {loading ? (
          <div className="p-6 text-center text-gray-500 flex-1">Loading…</div>
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
                  >
                    <td className="px-4 py-3">
                      <input type="checkbox" onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="px-4 py-3">{b.name}</td>
                    <td className="px-4 py-3">{b.reference}</td>
                    <td className="px-4 py-3">{b.taxGroup ?? "—"}</td>
                    <td className="px-4 py-3">{fmtDate(b.createdAt)}</td>
                  </tr>
                ))}

                {!paginatedRows.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No branches found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="flex justify-between items-center px-4 py-3 text-xs text-gray-500 border-t border-neutral-200 dark:border-neutral-800">
            <span>
              {totalRows === 0
                ? "Showing 0 to 0 out of 0"
                : `Showing ${startIndex} to ${endIndex} out of ${totalRows}`}
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-neutral-300 px-3 py-1 text-xs text-neutral-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Create Modal */}
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
              {/* ✅ Brand (Required) */}
              <label className="block text-sm">
                Brand<span className="text-red-500"> *</span>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.brandId || ""}
                  onChange={(e) => set("brandId", e.target.value)}
                  disabled={brandsLoading}
                >
                  <option value="">Choose…</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {brandsError ? (
                  <div className="text-xs text-red-600 mt-1">{brandsError}</div>
                ) : null}
              </label>

              {/* Name */}
              <label className="block text-sm">
                Name<span className="text-red-500"> *</span>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </label>

              {/* Name Localized */}
              <label className="block text-sm">
                Name Localized
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.nameLocalized || ""}
                  onChange={(e) => set("nameLocalized", e.target.value)}
                />
              </label>

              {/* Reference + Generate */}
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
                  className="h-10 rounded-md border hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
                  onClick={genRef}
                  type="button"
                  disabled={!form.brandId}
                  title={!form.brandId ? "Select Brand first" : "Generate Reference"}
                >
                  Generate
                </button>
              </div>

              {/* Tax Group */}
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

              {/* Branch Tax Registration Name */}
              <label className="block text-sm">
                Branch Tax Registration Name
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.branchTaxRegistrationName || ""}
                  onChange={(e) => set("branchTaxRegistrationName", e.target.value)}
                />
              </label>

              {/* Branch Tax Number */}
              <label className="block text-sm">
                Branch Tax Number
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.branchTaxNumber || ""}
                  onChange={(e) => set("branchTaxNumber", e.target.value)}
                />
              </label>

              {/* Opening From / To */}
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

              {/* Inventory End of Day */}
              <label className="block text-sm">
                Inventory End of Day
                <input
                  type="time"
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.inventoryEndOfDay || ""}
                  onChange={(e) => set("inventoryEndOfDay", e.target.value)}
                />
              </label>

              {/* Phone */}
              <label className="block text-sm">
                Phone
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.phone || ""}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </label>

              {/* Address */}
              <label className="block text-sm">
                Address
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  rows={2}
                  value={form.address || ""}
                  onChange={(e) => set("address", e.target.value)}
                />
              </label>

              {/* Street / Building */}
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

              {/* Additional / City */}
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  Additional Number
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                    value={form.additionalNumber || ""}
                    onChange={(e) => set("additionalNumber", e.target.value)}
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

              {/* District / Postal */}
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

              {/* CR / Latitude */}
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

              {/* Longitude */}
              <label className="block text-sm">
                Longitude
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.longitude || ""}
                  onChange={(e) => set("longitude", e.target.value)}
                />
              </label>

              {/* Display App */}
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.displayApp}
                  onChange={(e) => set("displayApp", e.target.checked)}
                />
                Display App
              </label>

              {/* Receipt Header */}
              <label className="block text-sm">
                Receipt Header
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  rows={2}
                  value={form.receiptHeader || ""}
                  onChange={(e) => set("receiptHeader", e.target.value)}
                />
              </label>

              {/* Receipt Footer */}
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

      {/* Filter Modal */}
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
                Brand
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={filters.brandId || ""}
                  onChange={(e) => setFilter("brandId", e.target.value)}
                  disabled={brandsLoading}
                >
                  <option value="">All</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* keep your other filter fields unchanged… */}
            </div>

            <div className="mt-4 flex justify-between gap-2">
              <button className="px-4 py-2 rounded-md border" onClick={() => setFilterOpen(false)}>
                Close
              </button>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-md border" onClick={() => setFilters({})}>
                  Clear
                </button>
                <button
                  className="px-4 py-2 rounded-md bg-black text-white hover:bg-neutral-800"
                  onClick={() => setFilterOpen(false)}
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
