"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderRow } from "./type";

type Branch = {
  id: string;
  name: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getTodayLocalISODate() {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60 * 1000;
  const local = new Date(d.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

/** Read brand from RootLayout BrandExpose */
function readGlobalBrandId(): string {
  if (typeof window === "undefined") return "ALL";
  const v = (window as any).__brandId;
  return typeof v === "string" && v.trim() ? v.trim() : "ALL";
}

export default function OrdersPage() {
  const router = useRouter();

  // brand (from layout)
  const [brandId, setBrandId] = useState<string>(() => readGlobalBrandId());

  const [branch, setBranch] = useState<string>("all");
  const [date, setDate] = useState<string>(() => getTodayLocalISODate());
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState<boolean>(false);

  // 🔍 search by orderNo
  const [search, setSearch] = useState<string>("");

  // 🔢 pagination (client-side)
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  // ✅ keep brand in query
  const qs = useMemo(() => {
    const p = new URLSearchParams();

    // brandId:
    // - if ALL -> omit or send ALL (both ok if backend supports)
    // We'll send it always for clarity.
    p.set("brandId", brandId || "ALL");

    if (branch && branch !== "all") p.set("branchId", branch);
    if (date) p.set("date", date);

    return p.toString();
  }, [brandId, branch, date]);

  /* -------------------- helper: branchId -> name --------------------- */
  const branchNameById = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b) => {
      if (b.id) map[b.id] = b.name;
    });
    return map;
  }, [branches]);

  /* ------------------------ row click handler ------------------------ */
  function handleRowClick(id: string) {
    if (!id) return;
    router.push(`/orders/${encodeURIComponent(id)}`);
  }

  /* ------------------------------------------------------------------ */
  /* Listen to brand changes from layout                                 */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    // 1) instant sync on mount
    setBrandId(readGlobalBrandId());

    // 2) polling (simple + reliable because layout doesn't dispatch events)
    const t = setInterval(() => {
      const next = readGlobalBrandId();
      setBrandId((prev) => (prev !== next ? next : prev));
    }, 250);

    // 3) also react to localStorage change (if user changes brand in another tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "selectedBrandId") {
        const next = readGlobalBrandId();
        setBrandId((prev) => (prev !== next ? next : prev));
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(t);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /* ----------------------- load orders from API ------------------------ */
  useEffect(() => {
    const token = getToken();

    setLoading(true);
    setError(null);

    const url = `${API_URL}/orders?${qs}`;
    console.log("🔍 Fetching orders from:", url);

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then(async (r) => {
        console.log("🔍 /orders status:", r.status);

        if (r.status === 401) throw new Error("unauthorized");
        if (!r.ok) throw new Error("failed");

        const data = await r.json();
        console.log("📦 Raw /orders payload:", data);

        // Ensure we pick the actual array from different API shapes
        let list: any = data;
        if (!Array.isArray(list)) {
          if (Array.isArray((data as any).data)) list = (data as any).data;
          else if (Array.isArray((data as any).items)) list = (data as any).items;
          else if (Array.isArray((data as any).orders)) list = (data as any).orders;
          else if (Array.isArray((data as any).rows)) list = (data as any).rows;
          else list = [];
        }

        // Normalize to OrderRow
        const normalized: OrderRow[] = list.map((o: any) => {
          const rawChannel = (o.channel ?? "").toString();
          let uiChannel: string;

          if (!rawChannel) uiChannel = "POS";
          else if (rawChannel.toUpperCase() === "CALLCENTER") uiChannel = "CALLCENTER";
          else uiChannel = rawChannel.toUpperCase();

          // Force PICK_UP for CallCenter, default DINE_IN for others
          let uiOrderType = "DINE_IN";
          if (uiChannel === "CALLCENTER") uiOrderType = "PICK_UP";

          return {
            id: o.id ?? o.orderId ?? o.orderNo ?? "",
            orderNo: o.orderNo ?? o.id ?? "",
            branchId: o.branchId ?? null,
            businessDate:
              typeof o.businessDate === "string"
                ? o.businessDate
                : o.businessDate
                ? new Date(o.businessDate).toISOString()
                : "",
            status: o.status ?? "",
            netSales:
              typeof o.netTotal === "number" ? o.netTotal : Number(o.netTotal ?? 0),
            channel: uiChannel,
            orderType: uiOrderType,
          };
        });

        setRows(normalized);
        setPage(1); // reset page whenever data is reloaded
      })
      .catch((err) => {
        console.error("Failed to load orders", err);
        setRows([]);

        if (err.message === "unauthorized") {
          setError("Session expired or unauthorized. Please log in again.");
        } else {
          setError("Unable to load orders. Please try again.");
        }
      })
      .finally(() => setLoading(false));
  }, [qs]);

  /* ---------------------- load branches from API ----------------------- */
  useEffect(() => {
    const token = getToken();

    setBranchesLoading(true);

    // ✅ If your backend supports brand filtering for branches, keep it:
    // - /branches?brandId=...
    // If it doesn't support it yet, it will just ignore it (safe).
    const bqs = new URLSearchParams();
    bqs.set("brandId", brandId || "ALL");

    fetch(`${API_URL}/branches?${bqs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then(async (r) => {
        if (r.status === 401) throw new Error("unauthorized");
        if (!r.ok) throw new Error("failed");

        const data = await r.json();

        let list: any = data;
        if (!Array.isArray(list)) {
          if (Array.isArray((data as any).data)) list = (data as any).data;
          else if (Array.isArray((data as any).items)) list = (data as any).items;
          else if (Array.isArray((data as any).branches)) list = (data as any).branches;
          else list = [];
        }

        const mapped: Branch[] = list.map((b: any) => ({
          id: b.id ?? b.branchId ?? b.code,
          name: b.name ?? b.branchName ?? b.code ?? "Unnamed branch",
        }));

        const cleaned = mapped.filter((b) => !!b.id);
        setBranches(cleaned);

        // ✅ If selected branch doesn't exist in this brand, reset to all
        if (branch !== "all" && !cleaned.some((x) => x.id === branch)) {
          setBranch("all");
        }
      })
      .catch((err) => {
        console.error("Failed to load branches", err);
        setBranches([]);
        setBranch("all");
      })
      .finally(() => setBranchesLoading(false));
  }, [brandId]); // ✅ reload branches when brand changes

  const money = (n: number) =>
    new Intl.NumberFormat("en-SA", {
      style: "currency",
      currency: "SAR",
    }).format(n || 0);

  /* ----------------- search + pagination on client ------------------ */

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      (r.orderNo || "").toString().toLowerCase().includes(term)
    );
  }, [rows, search]);

  // CLOSED orders only, on filtered set
  const closedRows = useMemo(
    () =>
      filteredRows.filter((r) => {
        const s = (r.status || "").toLowerCase();
        return s === "closed" || s === "paid" || s === "completed";
      }),
    [filteredRows]
  );

  const totalClosedNetSales = useMemo(
    () => closedRows.reduce((sum, r) => sum + (r.netSales || 0), 0),
    [closedRows]
  );

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex =
    totalRows === 0 ? 0 : Math.min(currentPage * pageSize, totalRows);

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

  // reset page on search change
  useEffect(() => {
    setPage(1);
  }, [search]);

  // ✅ reset page when brand changes
  useEffect(() => {
    setPage(1);
    setSearch("");
  }, [brandId]);

  return (
    <div className="space-y-6 min-h-[calc(100vh-120px)] flex flex-col">
      {/* Page header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div />

        <div className="flex items-center gap-4">
          <div className="hidden rounded-2xl bg-slate-900 px-4 py-3 text-right text-white shadow-sm sm:block">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
              Net Sales (Closed Orders)
            </div>
            <div className="text-lg font-semibold leading-tight">
              {money(totalClosedNetSales)}
            </div>
            <div className="text-[11px] text-slate-400">
              {closedRows.length} closed / {totalRows} order{totalRows !== 1 && "s"}
            </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Branch
            </label>
            <select
              className="h-10 min-w-[180px] rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setPage(1);
              }}
              disabled={branchesLoading && !branches.length}
            >
              <option value="all">
                {branchesLoading ? "Loading branches…" : "All branches"}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Business date
            </label>
            <input
              type="date"
              className="h-10 w-48 rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* 🔍 Search by Order # */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Search (Order #)
            </label>
            <input
              type="text"
              className="h-10 w-56 rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              placeholder="e.g. POS-1765…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex-1" />

          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100"
            onClick={() => {
              // ✅ include brandId in export too
              window.location.href = `${API_URL}/orders/export.csv?${qs}`;
            }}
          >
            <span className="text-xs uppercase tracking-[0.16em]">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-sm flex flex-col flex-1">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Orders
          </div>
          {loading ? (
            <span className="text-xs text-slate-400">Loading…</span>
          ) : (
            <span className="text-xs text-slate-400">
              {totalRows} result{totalRows !== 1 && "s"}
            </span>
          )}
        </div>

        <div className="flex-1 max-h-[520px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
              <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">Order #</th>
                <th className="px-4 py-3 text-left">Branch</th>
                <th className="px-4 py-3 text-left">Business Date</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Channel</th>
                <th className="px-4 py-3 text-left">Order Type</th>
                <th className="px-4 py-3 text-right">Net Sales</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading orders…
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-rose-500">
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                        <span className="text-lg">🧾</span>
                      </div>
                      <div className="text-sm font-medium text-slate-500">
                        No orders found
                      </div>
                      <p className="max-w-xs text-xs text-slate-400">
                        Try adjusting your filters (branch, business date, or order search)
                        to see more results.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                paginatedRows.length > 0 &&
                paginatedRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => handleRowClick(r.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 align-middle text-slate-900">
                      <span className="font-medium">#{r.orderNo}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className="font-medium">
                        {r.branchId ? branchNameById[r.branchId] || r.branchId : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-600">
                      {r.businessDate}
                    </td>
                    <td className="px-4 py-3 align-middle">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 align-middle text-slate-700">{r.channel}</td>
                    <td className="px-4 py-3 align-middle text-slate-700">{r.orderType}</td>
                    <td className="px-4 py-3 align-middle text-right font-medium text-slate-900">
                      {money(r.netSales)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs">
          <div className="text-slate-500">
            {totalRows === 0 ? (
              "Showing 0 to 0 out of 0"
            ) : (
              <>
                Showing <span className="font-medium">{startIndex}</span> to{" "}
                <span className="font-medium">{endIndex}</span> out of{" "}
                <span className="font-medium">{totalRows.toLocaleString("en-SA")}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              disabled={!canPrev}
              onClick={() => canPrev && setPage((p) => p - 1)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-40"
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
      </div>
    </div>
  );
}

/* ------------------------ status badge helper ------------------------ */

function statusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset";
  const s = (status || "").toLowerCase();

  if (s === "paid" || s === "completed" || s === "closed") {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-100`}>
        ● {status}
      </span>
    );
  }

  if (s === "pending" || s === "open" || s === "active") {
    return (
      <span className={`${base} bg-amber-50 text-amber-700 ring-amber-100`}>
        ● {status}
      </span>
    );
  }

  if (s === "cancelled" || s === "void") {
    return (
      <span className={`${base} bg-rose-50 text-rose-700 ring-rose-100`}>
        ● {status}
      </span>
    );
  }

  return (
    <span className={`${base} bg-slate-50 text-slate-700 ring-slate-200`}>
      ● {status}
    </span>
  );
}
