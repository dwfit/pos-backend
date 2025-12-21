"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Row = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  totalOrders: number;
  lastOrderAt?: string;
};

type CustomersApiResponse = {
  rows: Row[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalCustomers: number;
  totalOrders: number;
  activeCustomers: number;
  lastActiveAt?: string | null;
};

export default function CustomersPage() {
  const [data, setData] = useState<CustomersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        // ✅ Correct endpoint (because your server is using /api prefix)
        const res = await apiFetch<CustomersApiResponse>(
          `/api/customers?page=${page}&pageSize=${pageSize}`
        );

        if (!cancelled) setData(res);
      } catch (e) {
        // apiFetch already redirects on 401; this is for other errors
        console.error("Failed to load customers:", e);
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const rows = data?.rows ?? [];
  const totalCustomers = data?.totalCustomers ?? 0;
  const totalOrders = data?.totalOrders ?? 0;
  const activeCustomers = data?.activeCustomers ?? 0;

  const lastActiveAt =
    data?.lastActiveAt &&
    new Date(data.lastActiveAt).toLocaleDateString("en-SA", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });

  const formatDate = (value?: string) =>
    value
      ? new Date(value).toLocaleDateString("en-SA", {
          year: "numeric",
          month: "short",
          day: "2-digit",
        })
      : "-";

  const totalPages = data?.totalPages ?? 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const startIndex = totalCustomers === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex =
    totalCustomers === 0 ? 0 : Math.min(page * pageSize, totalCustomers);

  return (
    <div className="space-y-6 min-h-[calc(100vh-120px)] flex flex-col">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div></div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Total Customers
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {totalCustomers.toLocaleString("en-SA")}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            All customers in the system
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Total Orders
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {totalOrders.toLocaleString("en-SA")}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Across all customers
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-slate-900 px-4 py-3 text-white shadow-sm backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Active Customers
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-semibold">
              {activeCustomers.toLocaleString("en-SA")}
            </div>
            {lastActiveAt && (
              <div className="text-[11px] text-slate-300">
                Last activity: {lastActiveAt}
              </div>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            With at least one recorded order
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-sm flex flex-col flex-1">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Customers List
          </div>
          <div className="text-xs text-slate-400">
            {loading || !data
              ? "Loading..."
              : `${data.totalCustomers.toLocaleString("en-SA")} customer${
                  data.totalCustomers !== 1 ? "s" : ""
                }`}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
              <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-right">Total Orders</th>
                <th className="px-4 py-3 text-left">Last Order</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Loading customers...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                        <span className="text-lg">👥</span>
                      </div>
                      <div className="text-sm font-medium text-slate-500">
                        No customers yet
                      </div>
                      <p className="max-w-xs text-xs text-slate-400">
                        Once orders are created, customers will appear here with their
                        contact details.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-slate-50/70 cursor-pointer"
                    onClick={() => router.push(`/customers/${r.id}`)}
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold uppercase text-white">
                          {(r.name || "C")
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{r.name}</span>
                          {r.totalOrders === 0 && (
                            <span className="mt-0.5 inline-flex w-fit rounded-full bg-amber-50 px-2 py-[2px] text-[10px] font-medium text-amber-700 ring-1 ring-amber-100">
                              New customer
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-700">{r.phone}</td>
                    <td className="px-4 py-3 align-middle text-slate-600">
                      {r.email || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 align-middle text-right font-medium text-slate-900">
                      {r.totalOrders.toLocaleString("en-SA")}
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-600">
                      {formatDate(r.lastOrderAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs">
          <div className="text-slate-500">
            {totalCustomers === 0 ? (
              "Showing 0 to 0 out of 0"
            ) : (
              <>
                Showing <span className="font-medium">{startIndex}</span> to{" "}
                <span className="font-medium">{endIndex}</span> out of{" "}
                <span className="font-medium">
                  {totalCustomers.toLocaleString("en-SA")}
                </span>
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
