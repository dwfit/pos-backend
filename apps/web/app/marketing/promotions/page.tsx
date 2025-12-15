// apps/web/app/marketing/promotions/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

type PromotionStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';

type PromotionRow = {
  id: string;
  name: string;
  status: PromotionStatus;
  branches: string[];
  startDate: string;
  endDate: string;
  priority: number | null;
};

type PromotionListResponse = {
  items: PromotionRow[];
  total: number;
  take: number;
  skip: number;
};

/* ----------------------------- auth helper ----------------------------- */

function getToken() {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('token') ||
    localStorage.getItem('pos_token') ||
    ''
  );
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init && init.headers),
    },
    credentials: 'include',
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(text || `Request failed with ${res.status}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

/* -------------------------- local status helper ------------------------- */

function computeLocalStatus(p: PromotionRow): PromotionStatus {
  // Keep explicit INACTIVE as-is
  if (p.status === 'INACTIVE') return 'INACTIVE';

  const now = new Date();

  const start = new Date(p.startDate);
  const end = new Date(p.endDate);

  if (!isNaN(end.getTime()) && end < now) {
    return 'EXPIRED';
  }

  if (!isNaN(start.getTime()) && start > now) {
    return 'SCHEDULED';
  }

  return 'ACTIVE';
}

/* ------------------------------- Component ------------------------------ */

export default function PromotionsBoardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PromotionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [take, setTake] = useState(20);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const currentPage = useMemo(
    () => Math.floor(skip / take) + 1,
    [skip, take]
  );
  const totalPages = useMemo(
    () => (total ? Math.ceil(total / take) : 1),
    [total, take]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchJson<PromotionListResponse>(
          `${API_BASE}/promotions?take=${take}&skip=${skip}`
        );
        if (cancelled) return;
        setData(res.items || []);
        setTotal(res.total || 0);
        setTake(res.take || take);
        setSkip(res.skip || skip);
      } catch (err: any) {
        if (cancelled) return;
        console.error(err);
        setError(err?.message || 'Failed to load promotions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [take, skip]);

  const grouped = useMemo(() => {
    const base: Record<PromotionStatus, PromotionRow[]> = {
      ACTIVE: [],
      SCHEDULED: [],
      EXPIRED: [],
      INACTIVE: [],
    };

    for (const p of data) {
      const status = computeLocalStatus(p);
      base[status]?.push({ ...p, status });
    }

    return base;
  }, [data]);

  function handleRowClick(id: string) {
    router.push(`/marketing/promotions/${id}`);
  }

  function handleNewClick() {
    router.push('/marketing/promotions/new');
  }

  function goToPage(page: number) {
    const clamped = Math.min(Math.max(page, 1), totalPages);
    setSkip((clamped - 1) * take);
  }

  const columns: { key: PromotionStatus; title: string }[] = [
    { key: 'ACTIVE', title: 'Active' },
    { key: 'SCHEDULED', title: 'Scheduled' },
    { key: 'EXPIRED', title: 'Expired' },
    { key: 'INACTIVE', title: 'Inactive' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold"></h1>
        <button
          onClick={handleNewClick}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-xs font-semibold text-white hover:bg-slate-900"
        >
          <Plus className="h-4 w-4" />
          New Promotion
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const items = grouped[col.key] || [];
          return (
            <div
              key={col.key}
              className="flex h-[calc(100vh-220px)] flex-col rounded-lg border bg-white shadow-sm"
            >
              {/* column header */}
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{col.title}</span>
                  <span className="rounded-full bg-gray-100 px-2 text-xs font-semibold">
                    {items.length}
                  </span>
                </div>
              </div>

              {/* list body (scrollable) */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                {loading && data.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-sm text-gray-500">
                    Loading…
                  </div>
                )}

                {!loading && items.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-xs text-gray-400">
                    No promotions
                  </div>
                )}

                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleRowClick(p.id)}
                    className="w-full rounded-md border bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:border-violet-400 hover:bg-violet-50"
                  >
                    <div className="font-medium line-clamp-2">
                      {p.name}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {p.branches.slice(0, 1).join(', ')}
                      {p.branches.length > 1 && (
                        <span> +{p.branches.length - 1} more</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <span>
                        {new Date(p.startDate).toLocaleDateString()} –{' '}
                        {new Date(p.endDate).toLocaleDateString()}
                      </span>
                      {p.priority != null && (
                        <span className="rounded-full bg-gray-100 px-2">
                          Priority {p.priority}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* pinned footer (pagination) */}
              <div className="border-t px-3 py-2">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="rounded border px-2 py-1 disabled:opacity-40"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                    >
                      Prev
                    </button>
                    <button
                      className="rounded border px-2 py-1 disabled:opacity-40"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
