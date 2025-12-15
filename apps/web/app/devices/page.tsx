"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { Plus, Filter, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/* ---------- Types ---------- */

type DeviceType = "Cashier" | "KDS" | "Notifier" | "Display" | "Sub Cashier";
type DeviceStatus = "Used" | "Not Used";

type Device = {
  id: string;
  name: string;
  reference: string;
  status: DeviceStatus;
  type: DeviceType;
  branch?: string; // branch name
  branchId?: string | null;
};

type Branch = {
  id: string;
  name: string;
};

/* ---------- Type → Reference prefix map ---------- */

const TYPE_PREFIX: Record<DeviceType, string> = {
  Cashier: "C",
  KDS: "K",
  Notifier: "N",
  Display: "D",
  "Sub Cashier": "S",
};

/* ---------- API <-> UI enum mapping ---------- */

const DEVICE_TYPE_API_TO_UI: Record<string, DeviceType> = {
  CASHIER: "Cashier",
  KDS: "KDS",
  NOTIFIER: "Notifier",
  DISPLAY: "Display",
  SUB_CASHIER: "Sub Cashier",
};

const DEVICE_TYPE_UI_TO_API: Record<DeviceType, string> = {
  Cashier: "CASHIER",
  KDS: "KDS",
  Notifier: "NOTIFIER",
  Display: "DISPLAY",
  "Sub Cashier": "SUB_CASHIER",
};

const STATUS_API_TO_UI: Record<string, DeviceStatus> = {
  USED: "Used",
  NOT_USED: "Not Used",
};

const STATUS_UI_TO_API: Record<DeviceStatus, string> = {
  Used: "USED",
  "Not Used": "NOT_USED",
};

/* ---------- Small UI ---------- */

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "danger";
}) {
  const styles =
    tone === "success"
      ? "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200"
      : "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200";
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${styles}`}
    >
      {children}
    </span>
  );
}

const TABS: Array<{ key: "ALL" | DeviceType; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "Cashier", label: "Cashier" },
  { key: "KDS", label: "KDS" },
  { key: "Notifier", label: "Notifier" },
  { key: "Display", label: "Display" },
  { key: "Sub Cashier", label: "Sub Cashier" },
];

/* ---------- Page ---------- */

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [activeTab, setActiveTab] = useState<"ALL" | DeviceType>("ALL");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "ANY">(
    "ANY",
  );
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [open, setOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------- Row selection ----------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /* -------- Load branches + devices -------- */

  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      try {
        setLoading(true);
        setError(null);

        const brRes = await fetch(
          `${API_BASE}/branches?page=1&pageSize=200`,
          { credentials: "include" },
        );

        const brText = await brRes.text();
        let brJson: any = null;
        try {
          brJson = JSON.parse(brText);
        } catch (e) {
          console.error("branches JSON parse error:", e, brText);
        }

        if (!brRes.ok) {
          console.error("branches API error:", brRes.status, brJson);
          throw new Error(
            brJson?.error || brJson?.message || "Failed to load branches",
          );
        }

        if (cancelled) return;

        const branchArray: any[] = Array.isArray(brJson)
          ? brJson
          : brJson?.data ?? brJson?.items ?? [];

        const mappedBranches: Branch[] = branchArray.map((b: any) => ({
          id: String(b.id),
          name: String(b.name),
        }));

        setBranches(mappedBranches);
      } catch (err: any) {
        console.error("loadBranches error:", err);
        if (!cancelled)
          setError(err.message || "Failed to load branches data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadDevices() {
      try {
        const devRes = await fetch(
          `${API_BASE}/devices?page=1&pageSize=50`,
          { credentials: "include" },
        );

        const devText = await devRes.text();
        let devJson: any = null;
        try {
          devJson = JSON.parse(devText);
        } catch (e) {
          console.error("devices JSON parse error:", e, devText);
        }

        if (!devRes.ok) {
          console.error("devices API error:", devRes.status, devJson);
          return;
        }

        if (cancelled) return;

        const deviceArray: any[] = Array.isArray(devJson)
          ? devJson
          : devJson?.items ?? devJson?.data ?? devJson?.rows ?? [];

        const mappedDevices: Device[] = deviceArray.map((d: any) => ({
          id: String(d.id),
          name: String(d.name),
          reference: String(d.reference ?? d.deviceCode ?? ""),
          status:
            STATUS_API_TO_UI[d.status as string] ??
            ("Not Used" as DeviceStatus),
          type:
            DEVICE_TYPE_API_TO_UI[d.type as string] ??
            ("Cashier" as DeviceType),
          branch: d.branch?.name ?? undefined,
          branchId: d.branchId ?? d.branch?.id ?? null,
        }));

        setDevices(mappedDevices);
      } catch (err) {
        console.error("loadDevices error:", err);
      }
    }

    loadBranches();
    loadDevices();

    return () => {
      cancelled = true;
    };
  }, []);

  /* -------- Filtering / pagination -------- */

  const filtered = useMemo(() => {
    let rows = [...devices];

    if (activeTab !== "ALL") rows = rows.filter((r) => r.type === activeTab);
    if (statusFilter !== "ANY")
      rows = rows.filter((r) => r.status === statusFilter);

    if (branchFilter !== "all") {
      rows = rows.filter((r) => r.branchId === branchFilter);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.reference.toLowerCase().includes(q) ||
          (r.branch ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [devices, activeTab, query, statusFilter, branchFilter]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, statusFilter, branchFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex =
    total === 0 ? 0 : Math.min(safePage * pageSize, total);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize,
  );

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  // selection helpers for current page
  const allSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const someSelected =
    pageRows.some((r) => selected.has(r.id)) && !allSelected;

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageRows.forEach((r) => next.delete(r.id));
      } else {
        pageRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  // header checkbox indeterminate
  const headerCbRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCbRef.current) headerCbRef.current.indeterminate = someSelected;
  }, [someSelected]);

  /* -------- Next reference per type -------- */

  function getNextReference(type: DeviceType): string {
    const prefix = TYPE_PREFIX[type];

    const maxNum =
      devices
        .filter(
          (d) =>
            d.type === type &&
            typeof d.reference === "string" &&
            d.reference.startsWith(prefix),
        )
        .map((d) => d.reference)
        .map((r) => Number((r || "").replace(/[^\d]/g, "")))
        .filter((n) => !Number.isNaN(n))
        .reduce((a, b) => Math.max(a, b), 0) || 0;

    const next = String(maxNum + 1).padStart(3, "0");
    return `${prefix}${next}`;
  }

  /* -------- Create device -------- */

  async function handleCreateDevice(payload: {
    type: DeviceType;
    name: string;
    reference: string;
    branchId?: string | null;
  }) {
    try {
      const apiType = DEVICE_TYPE_UI_TO_API[payload.type];

      // Ensure reference has correct prefix for the type
      const prefix = TYPE_PREFIX[payload.type];
      let ref = payload.reference.trim();
      const digits = ref.replace(/[^\d]/g, "");

      if (!ref.startsWith(prefix)) {
        const num = digits ? Number(digits) : 1;
        const formatted = String(num).padStart(3, "0");
        ref = `${prefix}${formatted}`;
      }

      const res = await fetch(`${API_BASE}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: payload.name,
          type: apiType,
          reference: ref,
          branchId: payload.branchId || null,
        }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("create device JSON parse error:", e, text);
      }

      if (!res.ok) {
        console.error("create device error:", res.status, data);
        throw new Error(
          data?.error || data?.message || "Failed to create device",
        );
      }

      const branchName =
        data?.branch?.name ??
        branches.find((b) => b.id === payload.branchId)?.name ??
        undefined;

      setDevices((prev) => [
        ...prev,
        {
          id: String(data.id),
          name: data.name,
          reference: data.reference ?? data.deviceCode ?? "",
          status:
            STATUS_API_TO_UI[data.status as string] ??
            ("Not Used" as DeviceStatus),
          type:
            DEVICE_TYPE_API_TO_UI[data.type as string] ??
            ("Cashier" as DeviceType),
          branch: branchName,
          branchId: payload.branchId || null,
        },
      ]);
      setOpen(false);
    } catch (err: any) {
      console.error("create device failed", err);
      alert(err.message || "Unable to save device");
    }
  }

  /* -------- Render -------- */

  return (
    <div className="p-6 space-y-4 min-h-[calc(100vh-120px)] flex flex-col">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight"></h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-white text-sm font-medium shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-600"
          >
            <Plus className="h-4 w-4" />
            Create Device
          </button>

          <div className="relative">
            <details className="group">
              <summary className="list-none">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-600"
                >
                  <Filter className="h-4 w-4" />
                  Filter
                </button>
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-lg z-10">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Status
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["ANY", "Used", "Not Used"] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(key as any)}
                      className={`rounded-lg px-3 py-2 text-sm border ${
                        statusFilter === key
                          ? "border-black text-white bg-black"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium border transition ${
              activeTab === t.key
                ? "bg-black text-white border-black"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + Branch filter + status */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, reference, branch..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-600"
          />
        </div>

        {/* Branch filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Branch
          </label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <span className="text-xs text-gray-500">Loading data...</span>
        )}
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>

      {/* Table card – flex so footer stays at bottom */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white flex flex-col flex-1">
        <div className="max-h-[62vh] overflow-auto flex-1">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="text-left text-gray-600">
                <th className="w-10 px-4 py-3">
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAllOnPage}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Branch</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d, i) => (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/devices/${d.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/devices/${d.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={`cursor-pointer transition ${
                    i % 2 ? "bg-white" : "bg-gray-50/30"
                  } hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-600`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRow(d.id);
                      }}
                      checked={selected.has(d.id)}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-700">{d.reference}</td>
                  <td className="px-4 py-3">
                    {d.status === "Used" ? (
                      <Chip tone="danger">Used</Chip>
                    ) : (
                      <Chip tone="success">Not Used</Chip>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{d.type}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {d.branch || "-"}
                  </td>
                </tr>
              ))}

              {pageRows.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    No devices match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination – sticks to bottom of card */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white">
          <div className="text-xs text-gray-600">
            {total === 0 ? (
              "Showing 0 to 0 out of 0"
            ) : (
              <>
                Showing <span className="font-medium">{startIndex}</span> to{" "}
                <span className="font-medium">{endIndex}</span> out of{" "}
                <span className="font-medium">{total}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                canPrev
                  ? "bg-black text-white hover:bg-gray-900"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              Previous
            </button>
            <button
              onClick={() =>
                canNext && setPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={!canNext}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                canNext
                  ? "bg-black text-white hover:bg-gray-900"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <NewDeviceModal
          branches={branches}
          onClose={() => setOpen(false)}
          onSave={handleCreateDevice}
          defaultType="Cashier"
          defaultRef={getNextReference("Cashier")}
          getNextRef={getNextReference}
        />
      )}
    </div>
  );
}

/* ---------- Modal ---------- */

function NewDeviceModal({
  onClose,
  onSave,
  branches,
  defaultType,
  defaultRef,
  getNextRef,
}: {
  onClose: () => void;
  onSave: (data: {
    type: DeviceType;
    name: string;
    reference: string;
    branchId?: string | null;
  }) => void;
  branches: Branch[];
  defaultType: DeviceType;
  defaultRef: string;
  getNextRef: (type: DeviceType) => string;
}) {
  const [type, setType] = useState<DeviceType>(defaultType);
  const [name, setName] = useState("");
  const [reference, setReference] = useState(defaultRef);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);

  const canSave =
    name.trim().length > 0 && reference.trim().length > 0 && type;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-lg font-semibold">New Device</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Type */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Type <span className="text-rose-600">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as DeviceType;
                  setType(newType);
                  // Always regenerate reference when type changes
                  setReference(getNextRef(newType));
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              >
                {(
                  ["Cashier", "KDS", "Notifier", "Display", "Sub Cashier"] as
                  DeviceType[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Name <span className="text-rose-600">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>

            {/* Reference */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Reference <span className="text-rose-600">*</span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    setReference(getNextRef(type));
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Generate
                </button>
              </div>
            </div>

            {/* Branch */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Branch
              </label>
              <select
                value={branchId ?? ""}
                onChange={(e) => setBranchId(e.target.value || undefined)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Close
            </button>
            <button
              disabled={!canSave}
              onClick={() =>
                canSave &&
                onSave({
                  type,
                  name: name.trim(),
                  reference: reference.trim(),
                  branchId: branchId || null,
                })
              }
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                canSave
                  ? "bg-black text-white hover:bg-gray-900"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
              }`}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
