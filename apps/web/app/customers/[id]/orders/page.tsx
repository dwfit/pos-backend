"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { json } from "../../../../lib/fetcher";

type OrderSummary = {
  id: string;
  orderNo: string;
  netTotal: number;
  closedAt?: string;
  branch?: string | null;
  branchId?: string | null;
};

type BranchOpt = {
  id: string;
  name: string;
};

type OrdersResponse = {
  name: string;
  totalOrders: number;
  page: number;
  pageSize: number;
  totalPages: number;
  orders: OrderSummary[];
  branches: BranchOpt[];
};

export default function CustomerOrdersPage() {
  const { id } = useParams();
  const router = useRouter();

  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      if (search.trim()) params.set("search", search.trim());
      if (fromDate) params.set("dateFrom", fromDate);
      if (toDate) params.set("dateTo", toDate);
      if (branchId) params.set("branchId", branchId);

      const url = `/api/customers/${id}/orders?` + params.toString();

      const res = await json<OrdersResponse | null>(url, null);
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id, page, search, fromDate, toDate, branchId]);

  const fmtDate = (value?: string) =>
    value
      ? new Date(value).toLocaleString("en-SA", {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  if (loading && !data) {
    return <div className="p-6 text-slate-500">Loading...</div>;
  }

  if (!data) {
    return (
      <div className="p-6 text-red-500">
        Unable to load customer orders.
      </div>
    );
  }

  const canPrev = page > 1;
  const canNext = page < data.totalPages;

  const handleResetFilters = () => {
    setSearch("");
    setFromDate("");
    setToDate("");
    setBranchId("");
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push(`/customers/${id}`)}
        className="text-sm text-slate-500 hover:underline"
      >
        ← Back to Customer
      </button>

      <h1 className="text-2xl font-semibold">
        Orders of {data.name}
      </h1>

      {/* Summary */}
      <div className="rounded-xl border bg-white px-4 py-4 shadow-sm">
        <div className="text-xs uppercase text-slate-500">Total Orders</div>
        <div className="text-3xl font-bold mt-2">
          {data.totalOrders.toLocaleString("en-SA")}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white px-4 py-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search by orderNo */}
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-1">
              Search (Order No)
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="e.g. POS-123..."
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* From date */}
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-1">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPage(1);
                setFromDate(e.target.value);
              }}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* To date */}
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-1">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPage(1);
                setToDate(e.target.value);
              }}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* Branch filter */}
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-1">
              Branch
            </label>
            <select
              value={branchId}
              onChange={(e) => {
                setPage(1);
                setBranchId(e.target.value);
              }}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="">All branches</option>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="ml-auto rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Orders list */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex justify-between items-center border-b px-4 py-3">
          <h2 className="text-sm uppercase tracking-wide text-slate-500">
            Orders List
          </h2>
          <span className="text-xs text-slate-500">
            Page {data.page} of {data.totalPages} •{" "}
            {data.totalOrders} order{data.totalOrders !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500 text-center">
            Loading...
          </div>
        ) : data.orders.length === 0 ? (
          <div className="p-6 text-slate-400 text-center">
            No orders found with current filters.
          </div>
        ) : (
          <div className="divide-y">
            {data.orders.map((o) => (
              <div
                key={o.id}
                onClick={() => router.push(`/orders/${o.id}`)}
                className="p-4 cursor-pointer hover:bg-slate-50 transition"
              >
                <div className="flex justify-between">
                  <div className="font-medium text-slate-900">
                    {o.orderNo}
                  </div>
                  <div className="font-semibold text-slate-900">
                    {o.netTotal.toLocaleString("en-SA")} ﷼
                  </div>
                </div>

                <div className="text-xs mt-1 text-slate-500">
                  {fmtDate(o.closedAt)}
                  {o.branch ? ` • ${o.branch}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="text-xs text-slate-500">
            Showing {data.orders.length} of{" "}
            {data.totalOrders.toLocaleString("en-SA")} orders
          </div>
          <div className="flex gap-2">
            <button
              disabled={!canPrev}
              onClick={() => canPrev && setPage((p) => p - 1)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={!canNext}
              onClick={() => canNext && setPage((p) => p + 1)}
              className="rounded-lg bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
