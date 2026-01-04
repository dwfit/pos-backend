// apps/web/app/Reports/detailedpaymentreport/page.tsx
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

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
};

type PaymentMethod = {
  id: string;
  name: string;
  code?: string | null;
};

type PaymentType = {
  id: string;
  name: string;
  code?: string | null;
};

type PaymentRow = {
  paymentId: string;
  orderId: string;
  businessDate: string; // yyyy-mm-dd
  orderTime: string; // hh:mm
  branchName: string;
  orderType: string;
  channel: string;
  methodName: string;
  typeName?: string | null;
  amount: number | string;
  changeAmount?: number | string;
  netAmount: number | string;
  customerName?: string | null;
  customerPhone?: string | null;
  reference?: string | null;
};

type FiltersResponse = {
  branches: Branch[];
  customers: Customer[];
  paymentMethods: PaymentMethod[];
  paymentTypes: PaymentType[];
};

type ReportResponse = {
  rows: PaymentRow[];
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

/** Safely format money (numbers or numeric strings) */
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

export default function DetailedPaymentReportPage() {
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
  const [customerId, setCustomerId] = useState<string>("");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [paymentTypeId, setPaymentTypeId] = useState<string>("");

  // Options
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);

  // Report
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loadingFilters, setLoadingFilters] = useState<boolean>(false);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);

  /* --------------------- Derived summary metrics --------------------- */

  const summary = useMemo(() => {
    if (!rows.length) {
      return {
        totalPaid: 0,
        totalChange: 0,
        netReceived: 0,
        totalPayments: 0,
        avgPayment: 0,
      };
    }

    let totalPaid = 0;
    let totalChange = 0;
    let netReceived = 0;

    for (const r of rows) {
      const amt = Number(r.amount ?? 0);
      const chg = Number(r.changeAmount ?? 0);
      const net = Number(r.netAmount ?? 0);

      totalPaid += Number.isFinite(amt) ? amt : 0;
      totalChange += Number.isFinite(chg) ? chg : 0;
      netReceived += Number.isFinite(net) ? net : 0;
    }

    const totalPayments = rows.length;
    const avgPayment =
      totalPayments > 0 ? netReceived / totalPayments : 0;

    return {
      totalPaid,
      totalChange,
      netReceived,
      totalPayments,
      avgPayment,
    };
  }, [rows]);

  /* -------------------------- Load filters -------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function loadFilters() {
      try {
        setLoadingFilters(true);
        const data = await apiGet<FiltersResponse>(
          "/reports/detailed-payments/filters"
        );
        if (cancelled) return;

        setBranches(data.branches || []);
        setCustomers(data.customers || []);
        setPaymentMethods(data.paymentMethods || []);
        setPaymentTypes(data.paymentTypes || []);
      } catch (err) {
        console.error("loadPaymentFilters error", err);
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
        if (customerId) params.set("customerId", customerId);
        if (paymentMethodId) params.set("paymentMethodId", paymentMethodId);
        if (paymentTypeId) params.set("paymentTypeId", paymentTypeId);

        const data = await apiGet<ReportResponse>(
          `/reports/detailed-payments?${params.toString()}`
        );
        setRows(data.rows || []);
      } catch (err) {
        console.error("fetchPaymentReport error", err);
      } finally {
        setLoadingReport(false);
      }
    });
  }, [
    startDate,
    endDate,
    branchId,
    customerId,
    paymentMethodId,
    paymentTypeId,
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
            Detailed Payment Report
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Payment-level breakdown with filters for branch, customer,
            payment methods and types.
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

            {/* Payment method */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Payment Method
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All methods</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code ? `${m.code} – ${m.name}` : m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Payment Type
              </label>
              <select
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                value={paymentTypeId}
                onChange={(e) => setPaymentTypeId(e.target.value)}
                disabled={loadingFilters}
              >
                <option value="">All types</option>
                {paymentTypes.map((t) => (
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
                  setCustomerId("");
                  setPaymentMethodId("");
                  setPaymentTypeId("");
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
            label="Total Paid"
            value={summary.totalPaid}
            prefix="SAR "
            highlight
          />
          <SummaryCard
            label="Total Change"
            value={summary.totalChange}
            prefix="SAR "
          />
          <SummaryCard
            label="Net Received"
            value={summary.netReceived}
            prefix="SAR "
          />
          <SummaryCard
            label="Payments Count"
            value={summary.totalPayments}
          />
          <SummaryCard
            label="Avg Payment"
            value={summary.avgPayment}
            prefix="SAR "
          />
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Payments
              </h2>
              <p className="text-xs text-slate-500">
                {rows.length
                  ? `${rows.length} payments found`
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
                    "Payment ID",
                    "Order Type",
                    "Channel",
                    "Method",
                    "Type",
                    "Amount",
                    "Change",
                    "Net",
                    "Customer",
                    "Reference",
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
                    key={`${r.paymentId}-${idx}`}
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
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-slate-900">
                      {r.paymentId}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.orderType}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.channel}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-900">
                      {r.methodName}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
                      {r.typeName || "-"}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right text-slate-800">
                      {formatAmount(r.amount)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right text-slate-800">
                      {formatAmount(r.changeAmount ?? 0)}
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
                      {r.reference || "-"}
                    </td>
                  </tr>
                ))}

                {!rows.length && !busy && (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-4 py-10 text-center text-xs text-slate-400"
                    >
                      No results. Adjust filters and try again.
                    </td>
                  </tr>
                )}

                {busy && (
                  <tr>
                    <td
                      colSpan={14}
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
