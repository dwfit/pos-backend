// apps/web/app/Reports/detailedsalesreport/page.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { API_BASE } from "@/lib/api";
import { Loader2 } from "lucide-react";

/* ============================= Types ============================= */

type Branch = {
  id: string;
  name: string;
  code?: string | null;
};

type ProductSize = {
  id: string;
  name: string;
  productName?: string | null;
};

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
};

type Discount = {
  id: string;
  name: string;
  code?: string | null;
};

type Promotion = {
  id: string;
  name: string;
  code?: string | null;
};

type PriceTier = {
  id: string;
  name: string;
  code?: string | null;
};

// NOTE: at runtime numbers may come as strings from API (Prisma Decimal)
type DetailedSalesRow = {
  orderId: string;
  businessDate: string; // yyyy-mm-dd
  orderTime: string; // hh:mm
  branchName: string;
  orderType: string;
  channel: string;
  productName: string;
  sizeName: string;
  quantity: number | string;
  unitPrice: number | string;
  grossAmount: number | string;
  discountAmount: number | string;
  netAmount: number | string;
  customerName?: string | null;
  customerPhone?: string | null;
  discountName?: string | null;
  promotionName?: string | null;
  priceTierName?: string | null;
};

type FiltersResponse = {
  branches: Branch[];
  productSizes: ProductSize[];
  customers: Customer[];
  discounts: Discount[];
  promotions: Promotion[];
  priceTiers: PriceTier[];
};

type ReportResponse = {
  rows: DetailedSalesRow[];
};

/* ======================= Helpers / Token ======================== */

function getToken() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("pos_token") ||
    ""
  );
}

async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  });

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore parse error
  }

  if (!res.ok) {
    throw new Error(
      json?.message ||
        `Request failed (${res.status}) for ${path}`
    );
  }

  return (json as T) ?? ({} as T);
}

/** Safely format monetary amounts coming as number | string | null */
function formatAmount(v: number | string | null | undefined) {
  const n =
    typeof v === "number"
      ? v
      : v != null
      ? Number(v)
      : 0;
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

/* ============================= Page ============================= */

export default function DetailedSalesReportPage() {
  const [isPending, startTransition] = useTransition();

  // Filters
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const [branchId, setBranchId] = useState<string>("");
  const [productSizeId, setProductSizeId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [discountId, setDiscountId] = useState<string>("");
  const [promotionId, setPromotionId] = useState<string>("");
  const [priceTierId, setPriceTierId] = useState<string>("");

  // Options
  const [branches, setBranches] = useState<Branch[]>([]);
  const [productSizes, setProductSizes] = useState<ProductSize[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);

  // Report
  const [rows, setRows] = useState<DetailedSalesRow[]>([]);
  const [loadingFilters, setLoadingFilters] = useState<boolean>(false);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);

  /* --------------------- Derived summary metrics --------------------- */

  const summary = useMemo(() => {
    if (!rows.length) {
      return {
        totalNetSales: 0,
        totalGrossSales: 0,
        totalDiscount: 0,
        totalQty: 0,
        totalOrders: 0,
        avgTicket: 0,
      };
    }

    let totalNetSales = 0;
    let totalGrossSales = 0;
    let totalDiscount = 0;
    let totalQty = 0;
    const orderIds = new Set<string>();

    for (const r of rows) {
      const net = Number(r.netAmount ?? 0);
      const gross = Number(r.grossAmount ?? 0);
      const disc = Number(r.discountAmount ?? 0);
      const qty = Number(r.quantity ?? 0);

      totalNetSales += Number.isFinite(net) ? net : 0;
      totalGrossSales += Number.isFinite(gross) ? gross : 0;
      totalDiscount += Number.isFinite(disc) ? disc : 0;
      totalQty += Number.isFinite(qty) ? qty : 0;
      orderIds.add(r.orderId);
    }

    const totalOrders = orderIds.size || 0;
    const avgTicket =
      totalOrders > 0 ? totalNetSales / totalOrders : 0;

    return {
      totalNetSales,
      totalGrossSales,
      totalDiscount,
      totalQty,
      totalOrders,
      avgTicket,
    };
  }, [rows]);

  /* -------------------------- Load filters -------------------------- */

  useEffect(() => {
    let cancelled = false;
    async function loadFilters() {
      try {
        setLoadingFilters(true);
        const data = await apiGet<FiltersResponse>(
          "/reports/detailed-sales/filters"
        );
        if (cancelled) return;
        setBranches(data.branches || []);
        setProductSizes(data.productSizes || []);
        setCustomers(data.customers || []);
        setDiscounts(data.discounts || []);
        setPromotions(data.promotions || []);
        setPriceTiers(data.priceTiers || []);
      } catch (err) {
        console.error("loadFilters error", err);
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    }

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -------------------------- Load report --------------------------- */

  const fetchReport = React.useCallback(() => {
    startTransition(async () => {
      try {
        setLoadingReport(true);

        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        if (branchId) params.set("branchId", branchId);
        if (productSizeId) params.set("productSizeId", productSizeId);
        if (customerId) params.set("customerId", customerId);
        if (discountId) params.set("discountId", discountId);
        if (promotionId) params.set("promotionId", promotionId);
        if (priceTierId) params.set("priceTierId", priceTierId);

        const data = await apiGet<ReportResponse>(
          `/reports/detailed-sales?${params.toString()}`
        );
        setRows(data.rows || []);
      } catch (err) {
        console.error("fetchReport error", err);
      } finally {
        setLoadingReport(false);
      }
    });
  }, [
    startDate,
    endDate,
    branchId,
    productSizeId,
    customerId,
    discountId,
    promotionId,
    priceTierId,
  ]);

  // initial load
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  /* ------------------------ Quick range helpers ------------------------ */

  function setRange(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));

    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);

    setStartDate(s);
    setEndDate(e);
  }

  /* ------------------------------ Render ------------------------------ */

  const busy = isPending || loadingReport;

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Page header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Detailed Sales Report
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Line-level sales details with flexible filters for
            branch, customer, discounts, promotions and price tiers.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        {/* Filters card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Filters
            </h2>
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading…</span>
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4 lg:grid-cols-6">
            {/* Date range */}
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Business Date (from)
              </label>
              <input
                type="date"
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Business Date (to)
              </label>
              <input
                type="date"
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Branch */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Branch
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code ? `${b.code} – ${b.name}` : b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Product size */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Product / Size
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={productSizeId}
                onChange={(e) => setProductSizeId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All products</option>
                {productSizes.map((ps) => (
                  <option key={ps.id} value={ps.id}>
                    {ps.productName
                      ? `${ps.productName} – ${ps.name}`
                      : ps.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Customer
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` (${c.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Discount */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Discount
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={discountId}
                onChange={(e) => setDiscountId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All discounts</option>
                {discounts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Promotion */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Promotion
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={promotionId}
                onChange={(e) => setPromotionId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All promotions</option>
                {promotions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Price Tier */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Price Tier
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={priceTierId}
                onChange={(e) => setPriceTierId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All tiers</option>
                {priceTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code ? `${t.code} – ${t.name}` : t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="mr-1 text-slate-400">
                Quick ranges:
              </span>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-white"
                onClick={() => {
                  const d = new Date();
                  const today = d.toISOString().slice(0, 10);
                  setStartDate(today);
                  setEndDate(today);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-white"
                onClick={() => setRange(2)}
              >
                Yesterday &amp; Today
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-white"
                onClick={() => setRange(7)}
              >
                Last 7 days
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                onClick={() => {
                  const d = new Date();
                  const today = d.toISOString().slice(0, 10);
                  setStartDate(today);
                  setEndDate(today);
                  setBranchId("");
                  setProductSizeId("");
                  setCustomerId("");
                  setDiscountId("");
                  setPromotionId("");
                  setPriceTierId("");
                }}
                disabled={busy}
              >
                Reset
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-black disabled:opacity-60"
                onClick={fetchReport}
                disabled={busy}
              >
                {busy && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>Apply filters</span>
              </button>
            </div>
          </div>
        </section>

        {/* Summary cards */}
        <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <SummaryCard
            label="Net Sales"
            value={summary.totalNetSales}
            prefix="SAR "
            highlight
          />
          <SummaryCard
            label="Gross Sales"
            value={summary.totalGrossSales}
            prefix="SAR "
          />
          <SummaryCard
            label="Discounts"
            value={summary.totalDiscount}
            prefix="SAR "
          />
          <SummaryCard
            label="Total Quantity"
            value={summary.totalQty}
          />
          <SummaryCard
            label="Avg Amount"
            value={summary.avgTicket}
            prefix="SAR "
          />
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Line Items
              </h2>
              <p className="text-xs text-slate-500">
                {rows.length
                  ? `${rows.length} lines found`
                  : "No data for the selected filters."}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-slate-50">
                  {[
                    "Date",
                    "Time",
                    "Branch",
                    "Order ID",
                    "Order Type",
                    "Channel",
                    "Product",
                    "Size",
                    "Qty",
                    "Unit Price",
                    "Gross",
                    "Discount",
                    "Net",
                    "Customer",
                    "Promotion",
                    "Price Tier",
                  ].map((h) => (
                    <th
                      key={h}
                      className="sticky top-0 z-10 border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={`${r.orderId}-${idx}`}
                    className={
                      idx % 2 === 0
                        ? "bg-white"
                        : "bg-slate-50/60"
                    }
                  >
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.businessDate}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.orderTime}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.branchName}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-slate-900">
                      {r.orderId}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.orderType}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.channel}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-900">
                      {r.productName}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.sizeName}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right text-slate-800">
                      {Number(r.quantity ?? 0)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right text-slate-800">
                      {formatAmount(r.unitPrice)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right text-slate-800">
                      {formatAmount(r.grossAmount)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right text-rose-600">
                      {formatAmount(r.discountAmount)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold text-emerald-700">
                      {formatAmount(r.netAmount)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.customerName}
                      {r.customerPhone
                        ? ` (${r.customerPhone})`
                        : ""}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.promotionName || "-"}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.priceTierName || "-"}
                    </td>
                  </tr>
                ))}

                {!rows.length && !busy && (
                  <tr>
                    <td
                      colSpan={16}
                      className="px-4 py-10 text-center text-xs text-slate-400"
                    >
                      No results. Adjust filters and try again.
                    </td>
                  </tr>
                )}

                {busy && (
                  <tr>
                    <td
                      colSpan={16}
                      className="px-4 py-10 text-center text-xs text-slate-400"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading data…</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ======================== Summary Card ========================= */

function SummaryCard(props: {
  label: string;
  value: number;
  prefix?: string;
  highlight?: boolean;
}) {
  const { label, value, prefix, highlight } = props;

  const n = Number.isFinite(value) ? value : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-slate-500">
        {label}
      </p>
      <p
        className={
          "mt-1 text-lg font-semibold tracking-tight " +
          (highlight ? "text-slate-900" : "text-slate-800")
        }
      >
        {prefix}
        {n.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </p>
    </div>
  );
}
