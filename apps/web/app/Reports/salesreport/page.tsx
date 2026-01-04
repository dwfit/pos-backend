"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CreditCard } from "lucide-react";
import { apiFetch } from "@/lib/api";

/* --------------------- Types & helpers --------------------- */

type Period = "day" | "week" | "month";

type BranchOpt = { id: string; name: string };

type TotalsState = {
  sales: number;
  orders: number;
  avg: number;
  cash: number;
  card: number;
  others: number;
};

// normalize dates to YYYY-MM-DD (same as dashboard)
function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

// read brand id like your Dashboard (localStorage / global)
function readBrandId() {
  if (typeof window === "undefined") return "ALL";
  return (
    localStorage.getItem("selectedBrandId") ||
    (window as any).__brandId ||
    "ALL"
  );
}

const money = (n: number) =>
  new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
  }).format(Math.round(n || 0));

const toAmount = (v: any): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isClosedOrder = (o: any): boolean => {
  const s = (o.status ?? o.orderStatus ?? "").toString().toUpperCase();
  return s === "CLOSED";
};

// same date range logic as dashboard
const getDateRange = (p: Period, base: string | null | undefined) => {
  let b = base ? new Date(base) : new Date();
  if (isNaN(b.getTime())) b = new Date();

  let from: Date;
  let to: Date;

  if (p === "day") {
    from = new Date(b);
    to = new Date(b);
  } else if (p === "week") {
    to = new Date(b);
    from = new Date(b);
    from.setDate(from.getDate() - 6);
  } else {
    from = new Date(b.getFullYear(), b.getMonth(), 1);
    to = new Date(b.getFullYear(), b.getMonth() + 1, 0);
  }

  return { dateFrom: toYmd(from), dateTo: toYmd(to) };
};

/* --------------------- Page component --------------------- */

export default function SalesReportPage() {
  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [selectedBranchId, setSelectedBranchId] =
    useState<string>("all");

  const [brandId, setBrandId] = useState<string>(() => readBrandId());
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<TotalsState>({
    sales: 0,
    orders: 0,
    avg: 0,
    cash: 0,
    card: 0,
    others: 0,
  });

  // 🔁 poll brandId just like dashboard does
  useEffect(() => {
    const t = setInterval(() => {
      const next = readBrandId();
      setBrandId((prev) => (prev !== next ? next : prev));
    }, 250);
    return () => clearInterval(t);
  }, []);

  // 📊 load data whenever filters or brand change
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { dateFrom, dateTo } = getDateRange(period, baseDate);

        const params = new URLSearchParams();
        params.set("dateFrom", dateFrom);
        params.set("dateTo", dateTo);
        params.set("status", "CLOSED");
        if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);

        // ✅ same endpoint the dashboard uses
        // brandId is handled in apiFetch / backend middleware
        const data = await apiFetch<any>(`/orders?${params.toString()}`);

        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.rows)
            ? (data as any).rows
            : [];

        const closedRows = rows.filter(isClosedOrder);
        if (cancelled) return;

        // branches list from closed rows
        const branchMap = new Map<string, string>();
        for (const o of closedRows) {
          const id = o.branchId || o.branch?.id;
          if (!id) continue;
          const name =
            o.branch?.name ?? o.branchName ?? o.branch ?? "Unknown";
          if (!branchMap.has(id)) branchMap.set(id, name);
        }
        setBranches(
          Array.from(branchMap.entries()).map(([id, name]) => ({ id, name }))
        );

        // branch filter again (safety)
        let filtered = closedRows;
        if (selectedBranchId !== "all") {
          filtered = closedRows.filter((o: any) => {
            const id = o.branchId || o.branch?.id;
            return id === selectedBranchId;
          });
        }

        const orders = filtered.length;
        const sales = filtered.reduce(
          (sum: number, r: any) =>
            sum + toAmount(r.netSales ?? r.netTotal),
          0
        );

        // payments breakdown
        const paymentMap = new Map<string, number>();
        for (const o of filtered) {
          const paymentsArr = (o.payments || []) as any[];
          for (const p of paymentsArr) {
            const method = (p.method || "OTHER")
              .toString()
              .toUpperCase();
            paymentMap.set(
              method,
              (paymentMap.get(method) || 0) + toAmount(p.amount)
            );
          }
        }

        const cash = paymentMap.get("CASH") || 0;
        const card = paymentMap.get("CARD") || 0;
        const others = Array.from(paymentMap.entries()).reduce(
          (sum, [k, v]) =>
            k === "CASH" || k === "CARD" ? sum : sum + v,
          0
        );

        setTotals({
          sales,
          orders,
          avg: orders ? sales / orders : 0,
          cash,
          card,
          others,
        });
      } catch (err) {
        console.error("[salesreport] load error:", err);
        if (!cancelled) {
          setTotals({
            sales: 0,
            orders: 0,
            avg: 0,
            cash: 0,
            card: 0,
            others: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period, baseDate, selectedBranchId, brandId]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      {/* HEADER */}
      <header className="mb-6 text-center">
        <p className="text-sm text-slate-500 py-10">
          High-level sales performance and payment breakdowns.
        </p>
      </header>


      {/* TILES */}
      <div className="mx-auto max-w-5xl grid gap-5 md:grid-cols-2">
        {/* SALES REPORTS TILE */}
        <Link
          href="/Reports/detailedsalesreport"
          className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Sales Reports
                </h2>
                <p className="text-xs text-slate-500">
                  Net sales, orders, average ticket &amp; more.
                </p>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white">
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>

          {loading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Today Sales</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {money(totals.sales)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Orders</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {totals.orders}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Avg Ticket</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {money(totals.avg)}
                </p>
              </div>
            </div>
          )}
        </Link>

        {/* PAYMENT REPORTS TILE */}
        <Link
          href="/Reports/detailedpaymentreport"
          className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Payment Reports
                </h2>
                <p className="text-xs text-slate-500">
                  Payment mix by cash, card &amp; others.
                </p>
              </div>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white">
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>

          {loading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Cash</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {money(totals.cash)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Card</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {money(totals.card)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Others</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {money(totals.others)}
                </p>
              </div>
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}
