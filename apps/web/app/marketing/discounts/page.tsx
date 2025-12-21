// apps/web/app/marketing/discounts/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Filter, X, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { authStore } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

/* ----------------------------- auth helper ----------------------------- */

function getToken() {
  if (typeof window === "undefined") return "";
  try {
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("pos_token") ||
      ""
    );
  } catch {
    return "";
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const headers = new Headers(init?.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  // Only set JSON content-type when body exists (avoid breaking FormData etc.)
  const hasBody =
    init?.body !== undefined && init?.body !== null && init?.body !== "";
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  // ✅ central 401 handling
  if (res.status === 401) {
    authStore.expire("Session expired. Please log in again.");
    throw new Error("Unauthorized (401). Please login again.");
  }

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    let msg = text || `Request failed: ${res.status}`;
    try {
      const data = text ? JSON.parse(text) : null;
      msg = data?.message || data?.error || msg;
    } catch {}
    throw new Error(msg);
  }

  if (!text) return null as T;

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("fetchJson: failed to parse JSON", err, text);
    return null as T;
  }
}

/* ----------------------------- types ----------------------------- */

type DiscountQualification = "PRODUCT" | "ORDER" | "ORDER_AND_PRODUCT";
type DiscountType = "FIXED" | "PERCENTAGE";

type Discount = {
  id: string;
  name: string;
  nameLocalized?: string | null;
  qualification: DiscountQualification;
  type: DiscountType;
  value: number;
  reference: string;
  taxable: boolean;
  isDeleted: boolean;
};

/* ----------------------------- helpers ----------------------------- */

function qualificationLabel(q: DiscountQualification) {
  switch (q) {
    case "PRODUCT":
      return "Product";
    case "ORDER":
      return "Order";
    case "ORDER_AND_PRODUCT":
      return "Order & Product";
    default:
      return q;
  }
}

function discountTypeLabel(t: DiscountType) {
  switch (t) {
    case "FIXED":
      return "Fixed";
    case "PERCENTAGE":
      return "Percentage";
    default:
      return t;
  }
}

/* ----------------------------- page ----------------------------- */

export default function DiscountsPage() {
  const router = useRouter();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "deleted">("general");

  // search + filters
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<DiscountType | "ALL">("ALL");
  const [filterQualification, setFilterQualification] = useState<
    DiscountQualification | "ALL"
  >("ALL");
  const [filterTaxable, setFilterTaxable] = useState<"ALL" | "YES" | "NO">(
    "ALL"
  );

  // pagination (client-side)
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // form state
  const [name, setName] = useState("");
  const [nameLocalized, setNameLocalized] = useState("");
  const [qualification, setQualification] =
    useState<DiscountQualification>("PRODUCT");
  const [discountType, setDiscountType] =
    useState<DiscountType>("PERCENTAGE");
  const [value, setValue] = useState<string>("0");
  const [taxable, setTaxable] = useState(false);

  const generalDiscounts = useMemo(
    () => discounts.filter((d) => !d.isDeleted),
    [discounts]
  );
  const deletedDiscounts = useMemo(
    () => discounts.filter((d) => d.isDeleted),
    [discounts]
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchJson<Discount[]>(`${API_BASE}/discounts`)
      .then((data) => {
        if (mounted) setDiscounts(data || []);
      })
      .catch((err) => {
        console.error("Load discounts error", err);
        if (mounted) alert("Failed to load discounts.");
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  function resetForm() {
    setName("");
    setNameLocalized("");
    setQualification("PRODUCT");
    setDiscountType("PERCENTAGE");
    setValue("0");
    setTaxable(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Name is required");
      return;
    }

    const numericValue = parseFloat(value || "0");
    if (Number.isNaN(numericValue) || numericValue < 0) {
      alert("Discount value must be a non-negative number");
      return;
    }

    setCreating(true);
    try {
      const body = {
        name: name.trim(),
        nameLocalized: nameLocalized.trim() || undefined,
        qualification,
        type: discountType,
        value: numericValue,
        taxable,
      };

      const created = await fetchJson<Discount>(`${API_BASE}/discounts`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (created) setDiscounts((prev) => [created, ...prev]);
      setShowCreate(false);
      resetForm();
    } catch (err: any) {
      console.error("Create discount error", err);
      alert(`Failed to create discount: ${err?.message || "Unknown error"}`);
    } finally {
      setCreating(false);
    }
  }

  function openDetail(id: string) {
    router.push(`/marketing/discounts/${id}`);
  }

  const visibleDiscounts =
    activeTab === "general" ? generalDiscounts : deletedDiscounts;

  /* ---------------- filters + search + pagination ---------------- */

  const filteredDiscounts = useMemo(() => {
    let rows = [...visibleDiscounts];

    if (filterType !== "ALL") {
      rows = rows.filter((d) => d.type === filterType);
    }
    if (filterQualification !== "ALL") {
      rows = rows.filter((d) => d.qualification === filterQualification);
    }
    if (filterTaxable === "YES") {
      rows = rows.filter((d) => d.taxable);
    } else if (filterTaxable === "NO") {
      rows = rows.filter((d) => !d.taxable);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.reference || "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [visibleDiscounts, query, filterType, filterQualification, filterTaxable]);

  // reset to first page when filters/search/tab change
  useEffect(() => {
    setPage(1);
  }, [query, filterType, filterQualification, filterTaxable, activeTab]);

  const total = filteredDiscounts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = total === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = total === 0 ? 0 : Math.min(startIndex + pageSize, total);
  const pageRows = filteredDiscounts.slice(startIndex, endIndex);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  /* ----------------------------- render ----------------------------- */

  return (
    <div className="flex min-h-screen flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900"></h1>
          <p className="mt-1 text-xs text-slate-500"></p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or reference..."
              className="h-9 w-64 rounded-full border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {/* Filter popover */}
          <details className="relative">
            <summary className="list-none">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Filter className="h-4 w-4" />
                Filter
              </button>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
              <div className="space-y-2">
                <div>
                  <div className="mb-1 font-medium text-slate-600">
                    Qualification
                  </div>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    value={filterQualification}
                    onChange={(e) =>
                      setFilterQualification(
                        e.target.value as DiscountQualification | "ALL"
                      )
                    }
                  >
                    <option value="ALL">All</option>
                    <option value="PRODUCT">Product</option>
                    <option value="ORDER">Order</option>
                    <option value="ORDER_AND_PRODUCT">Order &amp; Product</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 font-medium text-slate-600">
                    Discount type
                  </div>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    value={filterType}
                    onChange={(e) =>
                      setFilterType(e.target.value as DiscountType | "ALL")
                    }
                  >
                    <option value="ALL">All</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 font-medium text-slate-600">Taxable</div>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    value={filterTaxable}
                    onChange={(e) =>
                      setFilterTaxable(e.target.value as "ALL" | "YES" | "NO")
                    }
                  >
                    <option value="ALL">All</option>
                    <option value="YES">Taxable</option>
                    <option value="NO">Non-taxable</option>
                  </select>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterQualification("ALL");
                      setFilterType("ALL");
                      setFilterTaxable("ALL");
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            </div>
          </details>

          {/* Create Discount – black bg, white text */}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-xs font-semibold text-white hover:bg-slate-900"
          >
            <Plus className="h-4 w-4" />
            Create Discount
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Tabs + small search on mobile */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 pt-3">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`relative px-3 pb-3 text-xs font-medium ${
                activeTab === "general"
                  ? "text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              General
              {activeTab === "general" && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-slate-900" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("deleted")}
              className={`relative px-3 pb-3 text-xs font-medium ${
                activeTab === "deleted"
                  ? "text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Deleted
              {activeTab === "deleted" && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-slate-900" />
              )}
            </button>
          </div>

          {/* mobile search */}
          <div className="relative mb-2 flex w-40 sm:hidden">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="h-8 w-full rounded-full border border-slate-200 bg-white pl-7 pr-2 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        {/* Table area */}
        <div className="flex-1 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="w-10 border-b border-slate-200 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-300"
                  />
                </th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium text-slate-500">
                  Name
                </th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium text-slate-500">
                  Reference
                </th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium text-slate-500">
                  Qualification
                </th>
                <th className="border-b border-slate-200 px-4 py-3 font-medium text-slate-500">
                  Discount
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="border-b border-slate-100 px-4 py-6 text-center text-slate-400"
                  >
                    Loading discounts...
                  </td>
                </tr>
              )}

              {!loading && total === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="border-b border-slate-100 px-4 py-6 text-center text-slate-400"
                  >
                    No discounts found.
                  </td>
                </tr>
              )}

              {!loading &&
                pageRows.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => openDetail(d.id)}
                  >
                    <td
                      className="border-b border-slate-100 px-4 py-3 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-slate-300"
                      />
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 align-middle text-slate-900">
                      {d.name}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 align-middle text-slate-500">
                      {d.reference || "—"}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 align-middle text-slate-500">
                      {qualificationLabel(d.qualification)}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 align-middle text-slate-500">
                      {d.type === "PERCENTAGE"
                        ? `${d.value}%`
                        : d.value.toFixed(2)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <div>
            {total === 0
              ? "No results"
              : `Showing ${startIndex + 1} to ${endIndex} out of ${total}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                canPrev
                  ? "bg-black text-white hover:bg-slate-900"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                canNext && setPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={!canNext}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                canNext
                  ? "bg-black text-white hover:bg-slate-900"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Create Discount
              </h2>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100"
                onClick={() => {
                  setShowCreate(false);
                  resetForm();
                }}
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <form
              onSubmit={handleCreate}
              className="space-y-3 px-4 py-4 text-xs"
            >
              {/* Name */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Qualification */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Qualification <span className="text-red-500">*</span>
                </label>
                <select
                  value={qualification}
                  onChange={(e) =>
                    setQualification(e.target.value as DiscountQualification)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                >
                  <option value="PRODUCT">Product</option>
                  <option value="ORDER">Order</option>
                  <option value="ORDER_AND_PRODUCT">Order &amp; Product</option>
                </select>
              </div>

              {/* Name localized */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Name Localized
                </label>
                <input
                  type="text"
                  value={nameLocalized}
                  onChange={(e) => setNameLocalized(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Discount Type */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Discount Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={discountType}
                  onChange={(e) =>
                    setDiscountType(e.target.value as DiscountType)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed</option>
                </select>
              </div>

              {/* Value */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Discount Value
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Taxable */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="taxable"
                  type="checkbox"
                  checked={taxable}
                  onChange={(e) => setTaxable(e.target.checked)}
                  className="h-3 w-3 rounded border-slate-300"
                />
                <label htmlFor="taxable" className="text-xs text-slate-700">
                  Taxable
                </label>
              </div>

              {/* Actions */}
              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    resetForm();
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex h-8 items-center rounded-lg bg-black px-4 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
                >
                  {creating ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
