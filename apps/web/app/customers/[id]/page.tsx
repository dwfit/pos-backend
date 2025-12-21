"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { json } from "../../../lib/fetcher";


type OrderSummary = {
  id: string;
  orderNo: string;
  businessDate?: string;
  netTotal: number;
  closedAt?: string;
  branch?: string | null;
};

type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  doneOrders: number;
  totalSpent: number;
  totalDiscounts: number;
  lastOrderAt?: string | null;
  favouriteProduct?: string | null;
  favouriteBranch?: string | null;
  orders: OrderSummary[];
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 🔹 simple client-side pagination for orders list
  const [page, setPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const res = await json<CustomerDetail | null>(
        `/api/customers/${id}`,
        null
      );
      if (!cancelled) {
        setData(res);
        setLoading(false);
        setPage(1); // reset to first page whenever customer data loads
      }
    }

    if (id) load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-red-500">
        Unable to load customer details.
      </div>
    );
  }

  const card =
    "rounded-xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm";

  const fmtDateTime = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString("en-SA", {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  // 🔹 pagination calculations
  const totalOrders = data.orders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedOrders = data.orders.slice(
    startIndex,
    startIndex + pageSize
  );
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className="p-6 space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="text-xs text-slate-500 hover:underline"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-semibold mt-2">{data.name}</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Done Orders */}
        <div className={card}>
          <div className="text-xs text-slate-500 uppercase">Done Orders</div>
          <button
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-lg font-semibold text-white"
            onClick={() => {
              const el = document.getElementById("customer-orders");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {data.doneOrders}
          </button>
        </div>

        {/* Total Spent */}
        <div className={card}>
          <div className="text-xs text-slate-500 uppercase">
            Total Spent (﷼)
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {data.totalSpent.toLocaleString("en-SA")}
          </div>
        </div>

        {/* Total Discounts */}
        <div className={card}>
          <div className="text-xs text-slate-500 uppercase">
            Total Discounts (﷼)
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {data.totalDiscounts.toLocaleString("en-SA")}
          </div>
        </div>

        {/* Last Order */}
        <div className={card}>
          <div className="text-xs text-slate-500 uppercase">Last Order</div>
          <div className="mt-2 text-sm font-medium">
            {fmtDateTime(data.lastOrderAt)}
          </div>
        </div>
      </div>

      {/* Basic info */}
      <div className={card}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-500">Name</div>
            <div className="mt-1 font-medium text-slate-900">{data.name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Email</div>
            <div className="mt-1 font-medium text-slate-900">
              {data.email || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Phone</div>
            <div className="mt-1 font-medium text-slate-900">{data.phone}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Favourite Branch</div>
            <div className="mt-1 font-medium text-slate-900">
              {data.favouriteBranch || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Orders list (with pagination) */}
      <div id="customer-orders" className={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Orders</h2>

          <button
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
            onClick={() => router.push(`/customers/${id}/orders`)}
          >
            View All Orders
          </button>
        </div>

        {totalOrders === 0 ? (
          <div className="text-sm text-slate-500">No orders yet.</div>
        ) : (
          <>
            <div className="space-y-2">
              {paginatedOrders.map((o) => (
                <div
                  key={o.id}
                  className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  onClick={() => router.push(`/orders/${o.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-900">
                      {o.orderNo}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {o.netTotal.toLocaleString("en-SA")} ﷼
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {fmtDateTime(o.closedAt)}{" "}
                    {o.branch ? `• ${o.branch}` : ""}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination controls */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="text-xs text-slate-500">
                Showing{" "}
                {totalOrders === 0
                  ? 0
                  : `${startIndex + 1}-${Math.min(
                      startIndex + pageSize,
                      totalOrders
                    )}`}{" "}
                of {totalOrders} orders
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!canPrev}
                  onClick={() => canPrev && setPage((p) => p - 1)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs disabled:opacity-40"
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
          </>
        )}
      </div>
    </div>
  );
}
