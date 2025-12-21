"use client";

import { useEffect, useState, useRef, type ReactNode, useMemo } from "react";
import { OrderRow } from "./orders/type";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { TrendingUp, ShoppingBag, CreditCard, Percent } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { apiFetch } from "@/lib/api";

type DashboardCards = {
  orders: number;
  netSales: number;
  netPayments: number;
  returns: number;
  discounts: number;
  avgTicket: number;
};

type SimpleKV = { label: string; value: number };
type BranchOpt = { id: string; name: string };
type Period = "day" | "week" | "month";

// normalize dates to YYYY-MM-DD (DB format)
function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function readBrandId() {
  if (typeof window === "undefined") return "ALL";
  return localStorage.getItem("selectedBrandId") || (window as any).__brandId || "ALL";
}

export default function Dashboard() {
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [trend, setTrend] = useState<{ h: string; v: number }[]>([]);
  const [orderTypeSales, setOrderTypeSales] = useState<SimpleKV[]>([]);
  const [orderTypes, setOrderTypes] = useState<SimpleKV[]>([]);
  const [topProducts, setTopProducts] = useState<SimpleKV[]>([]);
  const [topModifiers, setTopModifiers] = useState<SimpleKV[]>([]);
  const [topPayments, setTopPayments] = useState<SimpleKV[]>([]);
  const [topBranches, setTopBranches] = useState<SimpleKV[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // --------- filters ----------
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("day");
  const [baseDate, setBaseDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // ✅ trigger re-fetch when brand changes (poll storage)
  const [brandId, setBrandId] = useState<string>(() => readBrandId());
  useEffect(() => {
    const t = setInterval(() => {
      const next = readBrandId();
      setBrandId((p) => (p !== next ? next : p));
    }, 250);
    return () => clearInterval(t);
  }, []);

  // --------- export ----------
  const dashRef = useRef<HTMLDivElement | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const money = (n: number) =>
    new Intl.NumberFormat("en-SA", {
      style: "currency",
      currency: "SAR",
    }).format(Math.round(n || 0));

  const number = (n: number) =>
    new Intl.NumberFormat("en-SA").format(Math.round(n || 0));

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

  // ✅ returns { dateFrom, dateTo } in YYYY-MM-DD (inclusive range for backend)
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

  // Export handler: PDF or JPG
  async function handleExport(type: "pdf" | "jpg") {
    if (!dashRef.current) return;

    const canvas = await html2canvas(dashRef.current, { scale: 2 });

    if (type === "jpg") {
      const link = document.createElement("a");
      link.download = "dashboard.jpg";
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
      return;
    }

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("l", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    let pdfWidth = pageWidth;
    let pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    if (pdfHeight > pageHeight) {
      pdfHeight = pageHeight;
      pdfWidth = (canvas.width * pdfHeight) / canvas.height;
    }

    const x = (pageWidth - pdfWidth) / 2;
    const y = (pageHeight - pdfHeight) / 2;

    pdf.addImage(imgData, "PNG", x, y, pdfWidth, pdfHeight);
    pdf.save("dashboard.pdf");
  }

  // Load dashboard data whenever filters change (and brand changes)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { dateFrom, dateTo } = getDateRange(period, baseDate);

        const params = new URLSearchParams();
        params.set("dateFrom", dateFrom);
        params.set("dateTo", dateTo);
        params.set("status", "CLOSED");
        if (selectedBranchId !== "all") params.set("branchId", selectedBranchId);

        // ✅ Call your Express route directly: /orders (NOT /api/orders)
        // ✅ brandId is injected automatically by apiFetch (GET requests)
        const data = await apiFetch<any>(`/orders?${params.toString()}`);

        const rows: OrderRow[] = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.rows)
          ? (data as any).rows
          : [];

        const closedRows = (rows as any[]).filter(isClosedOrder);
        if (cancelled) return;

        // Build branch options from closed rows
        const branchIdNameMap = new Map<string, string>();
        for (const o of closedRows as any[]) {
          const id = o.branchId || o.branch?.id;
          if (!id) continue;
          const name = o.branch?.name ?? o.branchName ?? o.branch ?? "Unknown";
          if (!branchIdNameMap.has(id)) branchIdNameMap.set(id, name);
        }
        setBranches(
          Array.from(branchIdNameMap.entries()).map(([id, name]) => ({ id, name }))
        );

        // Apply branch filter (safety)
        let filteredRows = closedRows;
        if (selectedBranchId !== "all") {
          filteredRows = closedRows.filter((o: any) => {
            const id = o.branchId || o.branch?.id;
            return id === selectedBranchId;
          });
        }

        // Cards
        const orders = filteredRows.length;
        const netSales = filteredRows.reduce(
          (sum, r: any) => sum + toAmount(r.netSales ?? r.netTotal),
          0
        );
        const netPayments = netSales;
        const returns = 0;

        const discounts = filteredRows.reduce(
          (sum, r: any) => sum + toAmount(r.discountTotal ?? r.discountsTotal ?? 0),
          0
        );

        const avgTicket = orders ? netSales / orders : 0;

        setCards({ orders, netSales, netPayments, returns, discounts, avgTicket });

        // Trend
        const chartData = filteredRows.slice(0, 20).map((r: any) => ({
          h: `#${r.orderNo ?? r.id ?? ""}`,
          v: toAmount(r.netSales ?? r.netTotal),
        }));
        setTrend(chartData);

        // Aggregations
        const topN = (map: Map<string, number>, limit = 5): SimpleKV[] =>
          Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);

        const typeCountMap = new Map<string, number>();
        const typeSalesMap = new Map<string, number>();
        const productMap = new Map<string, number>();
        const modifierMap = new Map<string, number>();
        const paymentMap = new Map<string, number>();
        const branchSalesMap = new Map<string, number>();

        for (const o of filteredRows as any[]) {
          const sales = toAmount(o.netSales ?? o.netTotal);

          const branchName = o.branch?.name ?? o.branchName ?? o.branch ?? "Unknown";
          branchSalesMap.set(branchName, (branchSalesMap.get(branchName) || 0) + sales);

          const t = (o.orderType || o.type || o.channel || "Unknown")
            .toString()
            .toUpperCase();

          typeCountMap.set(t, (typeCountMap.get(t) || 0) + 1);
          typeSalesMap.set(t, (typeSalesMap.get(t) || 0) + sales);

          const lines = (o.items || o.lines || []) as any[];
          for (const line of lines) {
            const lineNet = toAmount(line.netSales ?? line.total);
            const key =
              line.product?.name ||
              line.productName ||
              line.name ||
              line.productId ||
              "Unknown";

            productMap.set(key, (productMap.get(key) || 0) + lineNet);

            const mods = (line.modifiers || []) as any[];
            for (const m of mods) {
              const basePrice = toAmount(m.price ?? m.modifierItem?.price);
              const qty = m.qty ?? line.qty ?? 1;
              const mNet = basePrice * qty;

              const mKey =
                m.modifierItem?.name || m.name || m.modifierItemId || "Modifier";

              modifierMap.set(mKey, (modifierMap.get(mKey) || 0) + mNet);
            }
          }

          const paymentsArr = (o.payments || []) as any[];
          for (const p of paymentsArr) {
            const method = (p.method || "OTHER").toString().toUpperCase();
            paymentMap.set(method, (paymentMap.get(method) || 0) + toAmount(p.amount));
          }
        }

        setOrderTypes(topN(typeCountMap, 5));
        setOrderTypeSales(topN(typeSalesMap, 5));
        setTopProducts(topN(productMap, 5));
        setTopModifiers(topN(modifierMap, 5));
        setTopPayments(topN(paymentMap, 5));
        setTopBranches(topN(branchSalesMap, 5));
      } catch (err: any) {
        console.error("Dashboard load error:", err);
        if (!cancelled) {
          setCards(null);
          setTrend([]);
          setOrderTypes([]);
          setOrderTypeSales([]);
          setTopProducts([]);
          setTopModifiers([]);
          setTopPayments([]);
          setTopBranches([]);
          setError("Unable to load dashboard data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period, baseDate, selectedBranchId, brandId]); // ✅ brandId triggers reload

  /* ---------------- UI COMPONENTS ---------------- */

  const KpiCard = ({
    title,
    value,
    hint,
    icon,
    tone,
  }: {
    title: string;
    value: string;
    hint?: string;
    icon: ReactNode;
    tone: "orange" | "green" | "blue" | "violet";
  }) => {
    const toneMap: Record<
      "orange" | "green" | "blue" | "violet",
      { bg: string; accent: string }
    > = {
      orange: { bg: "from-orange-500 to-amber-500", accent: "bg-orange-400/20" },
      green: { bg: "from-emerald-500 to-teal-500", accent: "bg-emerald-400/20" },
      blue: { bg: "from-sky-500 to-blue-600", accent: "bg-sky-400/20" },
      violet: { bg: "from-violet-500 to-fuchsia-500", accent: "bg-violet-400/20" },
    };

    const t = toneMap[tone];

    return (
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${t.bg} p-4 text-white shadow-sm`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
              {title}
            </div>
            <div className="mt-2 text-2xl font-semibold leading-tight">{value}</div>
            {hint && <div className="mt-1 text-[11px] text-white/80">{hint}</div>}
          </div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            {icon}
          </div>
        </div>
        <div className={`pointer-events-none absolute -right-6 -bottom-8 h-20 w-20 rounded-full ${t.accent}`} />
      </div>
    );
  };

  const MetricBarCard = ({
    title,
    rows,
    isMoney,
  }: {
    title: string;
    rows: SimpleKV[];
    isMoney?: boolean;
  }) => {
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    const data = rows.map((r) => ({
      name: r.label.length > 10 ? r.label.slice(0, 9) + "…" : r.label,
      value: r.value,
    }));

    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-slate-800">{title}</div>
            <div className="text-[11px] text-slate-400">
              Total {isMoney ? money(total) : number(total)}
            </div>
          </div>
          {!!rows.length && (
            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              Top {rows.length}
            </span>
          )}
        </div>

        <div className="h-28">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barCategoryGap={16}>
                <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: any) => (isMoney ? money(v as number) : number(v as number))}
                  contentStyle={{
                    borderRadius: 12,
                    borderColor: "#e5e7eb",
                    boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#0ea5e9" maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  };

  const totalOrders = cards?.orders ?? 0;
  const totalSales = cards?.netSales ?? 0;
  const totalPayments = cards?.netPayments ?? 0;
  const totalDiscounts = cards?.discounts ?? 0;
  const avgTicket = cards?.avgTicket ?? 0;

  return (
    <div className="space-y-6" ref={dashRef}>
      {/* FILTER BAR */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Period toggle */}
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1">
            {(["day", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full ${
                  period === p ? "bg-black text-white shadow-sm" : "text-slate-600"
                }`}
              >
                {p === "day" ? "Day" : p === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>

          {/* Date picker */}
          <input
            type="date"
            value={baseDate}
            onChange={(e) =>
              setBaseDate(e.target.value || new Date().toISOString().slice(0, 10))
            }
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/60"
          />
        </div>

        {/* Branch selector + info + EXPORT */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/60"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Closed orders metrics</span>
          </div>

          {/* Export button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="h-9 rounded-lg bg-black px-3 text-xs font-medium text-white shadow-sm"
            >
              Export
            </button>

            {exportOpen && (
              <div className="absolute right-0 z-50 mt-1 w-28 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    handleExport("pdf");
                  }}
                  className="block w-full px-3 py-1 text-left hover:bg-slate-50"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    handleExport("jpg");
                  }}
                  className="block w-full px-3 py-1 text-left hover:bg-slate-50"
                >
                  JPG
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading dashboard…</div>}

      {error && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      {/* TOP KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Sales"
          value={money(totalSales)}
          hint={`${number(totalOrders)} orders`}
          tone="orange"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Orders"
          value={number(totalOrders)}
          hint={`Avg amount ${money(avgTicket)}`}
          tone="blue"
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <KpiCard
          title="Net Payments"
          value={money(totalPayments)}
          hint="Approx. collected"
          tone="green"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <KpiCard
          title="Discounts"
          value={money(totalDiscounts)}
          hint="Promotions & coupons"
          tone="violet"
          icon={<Percent className="h-5 w-5" />}
        />
      </div>

      {/* SALES GRAPHS */}
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {/* Sales Trend */}
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-800">
                Sales from Closed Orders (Last {trend.length || 0})
              </div>
              <div className="text-xs text-slate-400">
                Each point represents one closed order&apos;s net sales.
              </div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="salesTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#fed7aa" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="h" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  tickFormatter={(v) => number(v as number)}
                />
                <Tooltip
                  formatter={(v: any) => money(v as number)}
                  labelFormatter={(l) => `Order ${l}`}
                  contentStyle={{
                    borderRadius: 12,
                    borderColor: "#e5e7eb",
                    boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
                    fontSize: 11,
                  }}
                />
                <Area type="monotone" dataKey="v" stroke="#f97316" strokeWidth={2} fill="url(#salesTrendGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales by Order Type */}
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-800">
                Sales by Order Type (Closed Only)
              </div>
              <div className="text-xs text-slate-400">
                Net sales grouped by order type for closed orders.
              </div>
            </div>
          </div>
          <div className="h-64">
            {orderTypeSales.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderTypeSales}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => number(v as number)}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                  />
                  <Tooltip
                    formatter={(v: any) => money(v as number)}
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "#e5e7eb",
                      boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#22c55e" maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {orderTypes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
              {orderTypes.map((t) => (
                <span key={t.label} className="rounded-full bg-slate-50 px-2 py-0.5 font-medium">
                  {t.label}: {number(t.value)} orders
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM KPI + GRAPHS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <MetricBarCard title="Top Selling Branches" rows={topBranches} isMoney />
        <MetricBarCard title="Top Selling Products" rows={topProducts} isMoney />
        <MetricBarCard title="Top Selling Modifiers" rows={topModifiers} isMoney />
        <MetricBarCard title="Top Payments" rows={topPayments} isMoney />
      </div>
    </div>
  );
}
