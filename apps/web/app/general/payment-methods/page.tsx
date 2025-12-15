"use client";

import React, { useEffect, useState } from "react";
import { X, Pencil, Trash2, RotateCcw, History } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type PaymentType = {
  id: string;
  name: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  nameLocalized?: string | null;
  code?: string | null;
  autoOpenCashDrawer?: boolean;
  isActive: boolean;
  deletedAt?: string | null;
  type: PaymentType;
};

type MethodForm = {
  id?: string;
  name: string;
  nameLocalized: string;
  typeId: string;
  code: string;
  autoOpenCashDrawer: boolean;
  isActive: boolean;
};

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  userId?: string | null;
  before?: any;
  after?: any;
};

type StatusFilter = "all" | "active" | "inactive" | "deleted";

/* ---------- helper to generate next code from existing methods ---------- */
function getNextPaymentCode(methods: PaymentMethod[]): string {
  const withCode = [...methods].filter((m) => !!m.code);
  if (!withCode.length) return "pm-001";
  const last = withCode.sort((a, b) =>
    (b.code || "").localeCompare(a.code || "")
  )[0];
  const num = parseInt(last.code!.replace("pm-", "")) || 0;
  const next = String(num + 1).padStart(3, "0");
  return `pm-${next}`;
}

export default function PaymentManagementPage() {
  const [activeTab, setActiveTab] = useState<"methods" | "types">("methods");

  const [types, setTypes] = useState<PaymentType[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const [openMethodModal, setOpenMethodModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [openTypeModal, setOpenTypeModal] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  const [methodForm, setMethodForm] = useState<MethodForm>({
    name: "",
    nameLocalized: "",
    typeId: "",
    code: "",
    autoOpenCashDrawer: false,
    isActive: true,
  });

  const [typeName, setTypeName] = useState("");

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const [auditForId, setAuditForId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  async function loadData() {
    const [tRes, mRes] = await Promise.all([
      fetch(`${API}/payment-methods/types`),
      fetch(
        `${API}/payment-methods?status=${statusFilter}&search=${encodeURIComponent(
          search
        )}`
      ),
    ]);

    const tJson = await tRes.json();
    const mJson = await mRes.json();

    console.log("Payment types response:", tJson);
    console.log("Payment methods response:", mJson);

    setTypes(Array.isArray(tJson) ? tJson : []);
    setMethods(Array.isArray(mJson) ? mJson : []);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  /* ---------------------------- Save handlers --------------------------- */

  async function saveMethod() {
    if (!methodForm.name.trim()) {
      alert("Name is required");
      return;
    }
    if (!methodForm.typeId) {
      alert("Please select a Type");
      return;
    }

    const payload = {
      name: methodForm.name,
      nameLocalized: methodForm.nameLocalized || "",
      typeId: methodForm.typeId,
      autoOpenCashDrawer: methodForm.autoOpenCashDrawer,
      isActive: methodForm.isActive,
    };

    if (editingId) {
      await fetch(`${API}/payment-methods/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`${API}/payment-methods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setOpenMethodModal(false);
    setEditingId(null);
    setMethodForm({
      name: "",
      nameLocalized: "",
      typeId: "",
      code: "",
      autoOpenCashDrawer: false,
      isActive: true,
    });
    loadData();
  }

  async function saveType() {
    if (!typeName.trim()) return;

    if (editingTypeId) {
      await fetch(`${API}/payment-methods/types/${editingTypeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: typeName.trim() }),
      });
    } else {
      await fetch(`${API}/payment-methods/types`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: typeName.trim() }),
      });
    }

    setTypeName("");
    setEditingTypeId(null);
    setOpenTypeModal(false);
    loadData();
  }

  /* ------------- open modal for add / edit payment method ------------- */

  function openAddMethodModal() {
    const nextCode = getNextPaymentCode(methods);
    setEditingId(null);
    setMethodForm({
      name: "",
      nameLocalized: "",
      typeId: "",
      code: nextCode,
      autoOpenCashDrawer: false,
      isActive: true,
    });
    setOpenMethodModal(true);
  }

  function openEditMethodModal(m: PaymentMethod) {
    setEditingId(m.id);
    setMethodForm({
      id: m.id,
      name: m.name,
      nameLocalized: m.nameLocalized || "",
      typeId: m.type.id,
      code: m.code || "",
      autoOpenCashDrawer: !!m.autoOpenCashDrawer,
      isActive: m.isActive,
    });
    setOpenMethodModal(true);
  }

  function openEditTypeModal(t: PaymentType) {
    setEditingTypeId(t.id);
    setTypeName(t.name);
    setOpenTypeModal(true);
  }

  /* --------------------- delete / restore / toggle --------------------- */

  async function toggleActive(m: PaymentMethod) {
    await fetch(`${API}/payment-methods/${m.id}/toggle`, {
      method: "PATCH",
    });
    loadData();
  }

  async function softDelete(m: PaymentMethod) {
    if (!confirm(`Delete payment method "${m.name}"?`)) return;
    await fetch(`${API}/payment-methods/${m.id}`, { method: "DELETE" });
    loadData();
  }

  async function restore(m: PaymentMethod) {
    await fetch(`${API}/payment-methods/${m.id}/restore`, {
      method: "PATCH",
    });
    loadData();
  }

  /* ---------------------- drag & drop ordering ---------------------- */

  function onDragStart(id: string) {
    setDraggedId(id);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  async function onDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    const current = [...methods];
    const fromIndex = current.findIndex((m) => m.id === draggedId);
    const toIndex = current.findIndex((m) => m.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);

    setMethods(current);
    setDraggedId(null);

    const ids = current.map((m) => m.id);
    await fetch(`${API}/payment-methods/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  /* --------------------------- audit log --------------------------- */

  async function openAudit(m: PaymentMethod) {
    setAuditForId(m.id);
    setLoadingAudit(true);
    const res = await fetch(`${API}/payment-methods/${m.id}/audit`);
    const logs = await res.json();
    setAuditLogs(logs);
    setLoadingAudit(false);
  }

  function closeAudit() {
    setAuditForId(null);
    setAuditLogs([]);
  }

  /* --------------------------- filtering --------------------------- */

  function tabButton(label: string, value: StatusFilter) {
    const active = statusFilter === value;
    return (
      <button
        key={value}
        onClick={() => setStatusFilter(value)}
        className={`px-3 py-1 rounded-full text-xs border ${active
            ? "bg-black text-white border-black"
            : "bg-white text-gray-600 border-gray-300"
          }`}
      >
        {label}
      </button>
    );
  }

  /* -------------------------------- UI --------------------------------- */

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Payments</h1>
      </div>

      {/* Tabs */}
      <div className="border-b mb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("methods")}
            className={`px-4 py-2 rounded-t-md text-sm font-medium ${activeTab === "methods"
                ? "bg-black text-white"
                : "bg-transparent text-gray-500"
              }`}
          >
            Payment Methods
          </button>
          <button
            onClick={() => setActiveTab("types")}
            className={`px-4 py-2 rounded-t-md text-sm font-medium ${activeTab === "types"
                ? "bg-black text-white"
                : "bg-transparent text-gray-500"
              }`}
          >
            Payment Types
          </button>
        </div>
      </div>

      {/* TAB CONTENT */}
      {activeTab === "methods" && (
        <div className="space-y-4">
          {/* Filters + search + add */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {tabButton("All", "all")}
              {tabButton("Active", "active")}
              {tabButton("Inactive", "inactive")}
              {tabButton("Deleted", "deleted")}
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <input
                className="flex-1 md:w-64 border rounded-lg px-3 py-2 text-sm"
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                onClick={openAddMethodModal}
                className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium"
              >
                Add Payment Method
              </button>
            </div>
          </div>

          {/* Methods grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.isArray(methods) &&
              methods.map((m) => (
                <div
                  key={m.id}
                  className={`border rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between transition-transform duration-150 ${draggedId === m.id ? "scale-[0.98] opacity-80" : ""
                    } ${m.deletedAt ? "opacity-60 bg-gray-50 line-through" : ""}`}
                  draggable={!m.deletedAt}
                  onDragStart={() => onDragStart(m.id)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(m.id)}
                >
                  {/* TOP: name + actions */}
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold mb-1">
                        {m.name}
                      </div>
                      {m.nameLocalized && (
                        <div className="text-sm text-gray-500 mb-1">
                          {m.nameLocalized}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        {m.type?.name || "—"}
                        {m.code && <span className="ml-2">• {m.code}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => openEditMethodModal(m)}
                        className="p-1 rounded-full hover:bg-gray-100"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!m.deletedAt ? (
                        <button
                          onClick={() => softDelete(m)}
                          className="p-1 rounded-full hover:bg-gray-100 text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => restore(m)}
                          className="p-1 rounded-full hover:bg-gray-100 text-green-600"
                          title="Restore"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openAudit(m)}
                        className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                        title="Audit log"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* BOTTOM: Active / Inactive pill + cash drawer note */}
                  <div className="mt-3 flex items-center justify-between">
                    {!m.deletedAt ? (
                      <button
                        onClick={() => toggleActive(m)}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${m.isActive
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-red-100 text-red-700 border-red-200"
                          }`}
                      >
                        {m.isActive ? "Active" : "Inactive"}
                      </button>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs bg-gray-200 text-gray-700">
                        Deleted
                      </span>
                    )}

                    {m.autoOpenCashDrawer && !m.deletedAt && (
                      <span className="text-xs text-gray-500">
                        Auto open cash drawer
                      </span>
                    )}
                  </div>
                </div>
              ))}

            {(!Array.isArray(methods) || methods.length === 0) && (
              <div className="text-sm text-gray-500">
                No payment methods for this filter. Try changing status or
                search.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "types" && (
        <div className="space-y-4">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                setEditingTypeId(null);
                setTypeName("");
                setOpenTypeModal(true);
              }}
              className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium"
            >
              Add Payment Type
            </button>
          </div>

          {/* Types list */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map((t) => (
              <div
                key={t.id}
                className="border rounded-xl p-4 bg-white shadow-sm flex items-center justify-between"
              >
                <div>
                  <div className="text-base font-semibold">{t.name}</div>
                </div>
                <button
                  onClick={() => openEditTypeModal(t)}
                  className="p-1 rounded-full hover:bg-gray-100"
                  title="Edit type"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ))}

            {types.length === 0 && (
              <div className="text-sm text-gray-500">
                No payment types yet. Click “Add Payment Type”.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------------- Add / Edit Payment Method Modal ----------------------- */}
      {openMethodModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-[420px] relative animate-[fadeIn_0.15s_ease-out]">
            <button
              className="absolute top-3 right-3 text-gray-500"
              onClick={() => {
                setOpenMethodModal(false);
                setEditingId(null);
              }}
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-semibold mb-4">
              {editingId ? "Edit Payment Method" : "Add Payment Method"}
            </h2>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block mb-1">Name *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={methodForm.name}
                  onChange={(e) =>
                    setMethodForm({ ...methodForm, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block mb-1">Name Localized</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={methodForm.nameLocalized}
                  onChange={(e) =>
                    setMethodForm({
                      ...methodForm,
                      nameLocalized: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="block mb-1">Type *</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={methodForm.typeId}
                  onChange={(e) =>
                    setMethodForm({ ...methodForm, typeId: e.target.value })
                  }
                >
                  <option value="">Select Type</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1">Code</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-100"
                  value={methodForm.code}
                  readOnly
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={methodForm.autoOpenCashDrawer}
                  onChange={(e) =>
                    setMethodForm({
                      ...methodForm,
                      autoOpenCashDrawer: e.target.checked,
                    })
                  }
                />
                <span>Auto Open Cash Drawer</span>
              </label>

              {/* NEW: Status Active / Inactive buttons just after Auto Open Cash Drawer */}
              <div className="flex items-center gap-2">
                <span className="text-sm">Status</span>
                <button
                  type="button"
                  onClick={() =>
                    setMethodForm({ ...methodForm, isActive: true })
                  }
                  className={`px-3 py-1 rounded-full text-xs border ${methodForm.isActive
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-600 border-gray-300"
                    }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMethodForm({ ...methodForm, isActive: false })
                  }
                  className={`px-3 py-1 rounded-full text-xs border ${!methodForm.isActive
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-600 border-gray-300"
                    }`}
                >
                  Inactive
                </button>
              </div>

              <button
                onClick={saveMethod}
                className="w-full mt-3 py-2 rounded-lg bg-black text-white text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------ Add / Edit Payment Type Modal ------------------------ */}
      {openTypeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-[360px] relative animate-[fadeIn_0.15s_ease-out]">
            <button
              className="absolute top-3 right-3 text-gray-500"
              onClick={() => {
                setOpenTypeModal(false);
                setEditingTypeId(null);
                setTypeName("");
              }}
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-semibold mb-4">
              {editingTypeId ? "Edit Payment Type" : "Add Payment Type"}
            </h2>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block mb-1">Type Name *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                />
              </div>

              <button
                onClick={saveType}
                className="w-full mt-3 py-2 rounded-lg bg-black text-white text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------- Audit Log Panel ----------------------------- */}
      {auditForId && (
        <div className="fixed inset-0 bg-black/30 flex justify-end z-50">
          <div className="w-full max-w-md h-full bg-white shadow-xl p-4 flex flex-col animate-[slideIn_0.15s_ease-out]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <History className="w-4 h-4" /> Audit Log
              </h2>
              <button
                onClick={closeAudit}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingAudit ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-sm text-gray-500">
                No audit entries for this payment method.
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto text-xs">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="border rounded-lg p-2 bg-gray-50 space-y-1"
                  >
                    <div className="flex justify-between">
                      <span className="font-semibold">{log.action}</span>
                      <span className="text-[10px] text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.userId && (
                      <div className="text-[11px] text-gray-500">
                        User: {log.userId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
