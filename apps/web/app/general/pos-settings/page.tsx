// apps/web/app/general/pos-settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, RotateCcw, Plus } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

/* --------- auth helper (same idea as other pages) --------- */
function getToken() {
  if (typeof window === "undefined") return "";
  // ✅ Try both keys so it matches whatever your login wrote
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("pos_token") ||
    ""
  );
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // ✅ Only send Authorization if we actually have a token
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  // Read body as text first so we can safely handle empty / 204 responses
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`
    );
  }

  // ✅ No content (e.g. 204) or empty body → just return null
  if (!text) {
    return null as T;
  }

  // ✅ Try to parse JSON; if it fails, log and return null
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("fetchJson: failed to parse JSON", err, text);
    return null as T;
  }
}

/* ----------------------------- Types ----------------------------- */
type Scheduler = {
  id: string;
  name: string;
  reference: string;
  intervalMinutes: number;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
};

type Aggregator = {
  id: string;
  name: string;
  reference: string;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
};

type Tab = "scheduler" | "aggregator";
type Filter = "all" | "active" | "inactive" | "deleted";
type DeleteType = "scheduler" | "aggregator" | null;

function fmtDateTime(value: string | Date) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-SA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PosSettingsPage() {
  const [tab, setTab] = useState<Tab>("scheduler");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const [schedulers, setSchedulers] = useState<Scheduler[]>([]);
  const [aggs, setAggs] = useState<Aggregator[]>([]);
  const [loading, setLoading] = useState(false);

  // dialog state (add / edit)
  const [editingScheduler, setEditingScheduler] = useState<Scheduler | null>(null);
  const [editingAgg, setEditingAgg] = useState<Aggregator | null>(null);
  const [modalType, setModalType] = useState<"scheduler" | "aggregator" | null>(null);

  // delete confirm modal state
  const [deleteType, setDeleteType] = useState<DeleteType>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // form fields
  const [formName, setFormName] = useState("");
  const [formRef, setFormRef] = useState("");
  const [formInterval, setFormInterval] = useState<number>(30);
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function openSchedulerModal(s?: Scheduler) {
    setModalType("scheduler");
    setEditingScheduler(s || null);
    setEditingAgg(null);

    setFormName(s?.name || "");
    setFormRef(s?.reference || "");
    setFormInterval(s?.intervalMinutes || 30);
    setFormActive(s?.isActive ?? true);
  }

  function openAggModal(a?: Aggregator) {
    setModalType("aggregator");
    setEditingAgg(a || null);
    setEditingScheduler(null);

    setFormName(a?.name || "");
    setFormRef(a?.reference || "");
    setFormActive(a?.isActive ?? true);
    setFormInterval(30);
  }

  function closeModal() {
    setModalType(null);
    setEditingScheduler(null);
    setEditingAgg(null);
    setFormName("");
    setFormRef("");
    setFormInterval(30);
    setFormActive(true);
    setSaving(false);
  }

  // open/close delete confirm
  function openDeleteConfirm(type: "scheduler" | "aggregator", id: string) {
    setDeleteType(type);
    setDeleteId(id);
    setDeleteLoading(false);
  }

  function closeDeleteConfirm() {
    setDeleteType(null);
    setDeleteId(null);
    setDeleteLoading(false);
  }

  async function loadSchedulers() {
    const data = await fetchJson<Scheduler[]>(
      `${API_BASE}/api/pos-settings/schedulers?includeDeleted=1`
    );
    setSchedulers(data || []);
  }

  async function loadAggregators() {
    const data = await fetchJson<Aggregator[]>(
      `${API_BASE}/api/pos-settings/aggregators?includeDeleted=1`
    );
    setAggs(data || []);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadSchedulers(), loadAggregators()])
      .catch((e) => console.error("POS settings load error", e))
      .finally(() => setLoading(false));
  }, []);

  const filteredSchedulers = useMemo(() => {
    return schedulers.filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.reference.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === "all") return !s.isDeleted;
      if (filter === "deleted") return !!s.isDeleted;
      if (filter === "active") return s.isActive && !s.isDeleted;
      if (filter === "inactive") return !s.isActive && !s.isDeleted;
      return true;
    });
  }, [schedulers, filter, search]);

  const filteredAggregators = useMemo(() => {
    return aggs.filter((a) => {
      const matchesSearch =
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.reference.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === "all") return !a.isDeleted;
      if (filter === "deleted") return !!a.isDeleted;
      if (filter === "active") return a.isActive && !a.isDeleted;
      if (filter === "inactive") return !a.isActive && !a.isDeleted;
      return true;
    });
  }, [aggs, filter, search]);

  async function saveScheduler() {
    setSaving(true);
    try {
      const body = {
        name: formName,
        reference: formRef || "",
        intervalMinutes: formInterval,
        isActive: formActive,
      };
      if (editingScheduler) {
        await fetchJson(
          `${API_BASE}/api/pos-settings/schedulers/${editingScheduler.id}`,
          {
            method: "PUT",
            body: JSON.stringify(body),
          }
        );
      } else {
        await fetchJson(`${API_BASE}/api/pos-settings/schedulers`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      await loadSchedulers();
      closeModal();
    } catch (e: any) {
      alert(e?.message || "Failed to save scheduler");
      setSaving(false);
    }
  }

  async function saveAggregator() {
    setSaving(true);
    try {
      const body = {
        name: formName,
        reference: formRef || "",
        isActive: formActive,
      };
      if (editingAgg) {
        await fetchJson(
          `${API_BASE}/api/pos-settings/aggregators/${editingAgg.id}`,
          {
            method: "PUT",
            body: JSON.stringify(body),
          }
        );
      } else {
        await fetchJson(`${API_BASE}/api/pos-settings/aggregators`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      await loadAggregators();
      closeModal();
    } catch (e: any) {
      alert(e?.message || "Failed to save aggregator");
      setSaving(false);
    }
  }

  // actual soft delete logic (used from confirm modal)
  async function handleConfirmDelete() {
    if (!deleteType || !deleteId) return;

    setDeleteLoading(true);
    try {
      if (deleteType === "scheduler") {
        await fetchJson(`${API_BASE}/api/pos-settings/schedulers/${deleteId}`, {
          method: "DELETE",
        });
        await loadSchedulers();
      } else if (deleteType === "aggregator") {
        await fetchJson(
          `${API_BASE}/api/pos-settings/aggregators/${deleteId}`,
          {
            method: "DELETE",
          }
        );
        await loadAggregators();
      }
      closeDeleteConfirm();
    } catch (e: any) {
      alert(e?.message || "Failed to mark as deleted");
      setDeleteLoading(false);
    }
  }

  async function restoreScheduler(id: string) {
    await fetchJson(`${API_BASE}/api/pos-settings/schedulers/${id}/restore`, {
      method: "POST",
    });
    await loadSchedulers();
  }

  async function restoreAggregator(id: string) {
    await fetchJson(
      `${API_BASE}/api/pos-settings/aggregators/${id}/restore`,
      { method: "POST" }
    );
    await loadAggregators();
  }

  const list = tab === "scheduler" ? filteredSchedulers : filteredAggregators;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">POS Settings</h2>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab("scheduler")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "scheduler"
              ? "border-black text-black"
              : "border-transparent text-slate-500"
          }`}
        >
          Scheduler
        </button>
        <button
          onClick={() => setTab("aggregator")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "aggregator"
              ? "border-black text-black"
              : "border-transparent text-slate-500"
          }`}
        >
          Aggrigators
        </button>
      </div>

      {/* Filters + search + add button */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "All" },
            { id: "active", label: "Active" },
            { id: "inactive", label: "Inactive" },
            { id: "deleted", label: "Deleted" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as Filter)}
              className={`px-3 py-1.5 rounded-full text-xs border ${
                filter === f.id
                  ? "bg-black text-white border-black"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or reference..."
            className="border rounded-xl px-3 py-2 text-sm min-w-[220px]"
          />
          <button
            onClick={() =>
              tab === "scheduler" ? openSchedulerModal() : openAggModal()
            }
            className="inline-flex items-center gap-2 rounded-xl bg-black text-white text-sm px-4 py-2"
          >
            <Plus className="w-4 h-4" />
            {tab === "scheduler" ? "Add Scheduler" : "Add Aggregator"}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-slate-500">No items found.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tab === "scheduler"
            ? filteredSchedulers.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl bg-white p-4 shadow-sm border flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500">
                        Every {s.intervalMinutes} minutes • {s.reference}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openSchedulerModal(s)}
                        className="p-1 rounded-lg hover:bg-slate-100"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!s.isDeleted ? (
                        <button
                          onClick={() =>
                            openDeleteConfirm("scheduler", s.id)
                          }
                          className="p-1 rounded-lg hover:bg-red-50 text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => restoreScheduler(s.id)}
                          className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                        s.isDeleted
                          ? "bg-red-50 text-red-600"
                          : s.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.isDeleted
                        ? "Deleted"
                        : s.isActive
                        ? "Active"
                        : "Inactive"}
                    </span>
                    <span>Updated {fmtDateTime(s.updatedAt)}</span>
                  </div>
                </div>
              ))
            : filteredAggregators.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl bg-white p-4 shadow-sm border flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-slate-500">
                        {a.reference}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openAggModal(a)}
                        className="p-1 rounded-lg hover:bg-slate-100"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!a.isDeleted ? (
                        <button
                          onClick={() =>
                            openDeleteConfirm("aggregator", a.id)
                          }
                          className="p-1 rounded-lg hover:bg-red-50 text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => restoreAggregator(a.id)}
                          className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                        a.isDeleted
                          ? "bg-red-50 text-red-600"
                          : a.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {a.isDeleted
                        ? "Deleted"
                        : a.isActive
                        ? "Active"
                        : "Inactive"}
                    </span>
                    <span>Updated {fmtDateTime(a.updatedAt)}</span>
                  </div>
                </div>
              ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalType && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {modalType === "scheduler"
                  ? editingScheduler
                    ? "Edit Scheduler"
                    : "Add Scheduler"
                  : editingAgg
                  ? "Edit Aggregator"
                  : "Add Aggregator"}
              </h3>
              <button
                onClick={closeModal}
                className="px-2 py-1 rounded-lg text-sm hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-slate-600">Name</span>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-slate-600">Reference</span>
                <input
                  value={formRef}
                  onChange={(e) => setFormRef(e.target.value)}
                  placeholder={
                    modalType === "scheduler"
                      ? "sch-001 (auto if empty)"
                      : "agg-001 (auto if empty)"
                  }
                  className="border rounded-xl px-3 py-2 text-sm"
                />
              </label>

              {modalType === "scheduler" && (
                <label className="grid gap-1">
                  <span className="text-slate-600">Interval</span>
                  <select
                    value={formInterval}
                    onChange={(e) => setFormInterval(Number(e.target.value))}
                    className="border rounded-xl px-3 py-2 text-sm"
                  >
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={45}>Every 45 minutes</option>
                    <option value={60}>Every 60 minutes</option>
                  </select>
                </label>
              )}

              <label className="inline-flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                <span className="text-slate-600">Active</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-xl border text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  modalType === "scheduler" ? saveScheduler() : saveAggregator()
                }
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-black text-white text-sm disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal (inside site) */}
      {deleteType && deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDeleteConfirm}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold">
              {deleteType === "scheduler"
                ? "Delete scheduler"
                : "Delete aggregator"}
            </h3>
            <p className="text-sm text-slate-600">
              Mark this {deleteType === "scheduler" ? "scheduler" : "aggregator"} as
              deleted? You can restore it later from the{" "}
              <span className="font-medium">Deleted</span> filter.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={closeDeleteConfirm}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl border text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm disabled:opacity-50"
              >
                {deleteLoading ? "Deleting…" : "Mark as deleted"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
