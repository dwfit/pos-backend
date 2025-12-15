"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, X } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ApiDevice = {
  id: string;
  name: string;
  reference: string | null;
  type: string; // "CASHIER" | ...
  status: string; // "USED" | "NOT_USED"
  deviceCode?: string | null;

  activationCode?: string | null;
  activationCodeGeneratedAt?: string | null;
  updatedAt?: string | null;
  lastSeenAt?: string | null;

  createdAt?: string | null;
  branch?: { id: string; name: string | null } | null;
};

type Branch = { id: string; name: string };

type DeviceSettings = {
  callNumberStart?: string | null;
  callNumberReset?: string | null;

  defaultOrderType?: string | null; // "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "NONE"
  disabledOrderTypes?: string[];
  kitchenPrintLanguage?: string | null; // "EN","AR","Multi"

  autoApplyOrderTags?: string[];
  assignedTables?: string[];
  defaultPriceTag?: string | null;

  sendEodReportTo?: string | null;
  sendShiftReportTo?: string | null;
  sendTillReportTo?: string | null;

  // toggles
  autoPair?: boolean;
  enableBarcodeScanners?: boolean;
  autoAcceptOnline?: boolean;
  printOnlineInfo?: boolean;
  autoSendAheadToKitchen?: boolean;
  disableAutoReceiptPrint?: boolean;
  useCallNumberFromMaster?: boolean;
  printDrawerOps?: boolean;
  forceSelectPriceTag?: boolean;
  forceSelectSeat?: boolean;
};

const DEVICE_TYPE_API_TO_UI: Record<string, string> = {
  CASHIER: "Cashier",
  KDS: "KDS",
  NOTIFIER: "Notifier",
  DISPLAY: "Display",
  SUB_CASHIER: "Sub Cashier",
};
const DEVICE_TYPE_UI_TO_API: Record<string, string> = {
  Cashier: "CASHIER",
  KDS: "KDS",
  Notifier: "NOTIFIER",
  Display: "DISPLAY",
  "Sub Cashier": "SUB_CASHIER",
};
const STATUS_API_TO_UI: Record<string, string> = {
  USED: "Used",
  NOT_USED: "Not Used",
};
const STATUS_UI_TO_API: Record<string, "USED" | "NOT_USED"> = {
  Used: "USED",
  "Not Used": "NOT_USED",
};

/** Type → reference prefix (C/K/N/D/S) */
const DEVICE_TYPE_PREFIX: Record<string, string> = {
  Cashier: "C",
  KDS: "K",
  Notifier: "N",
  Display: "D",
  "Sub Cashier": "S",
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">
        {value && value !== "" ? value : "—"}
      </span>
    </div>
  );
}

export default function DeviceDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;

  const [device, setDevice] = useState<ApiDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // edit modal
  const [branches, setBranches] = useState<Branch[]>([]);
  const [openEdit, setOpenEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // device settings sheet
  const [openSettings, setOpenSettings] = useState(false);
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // sync state
  const [syncing, setSyncing] = useState(false);

  // popup alert
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  async function fetchDevice() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/devices/${id}`, { credentials: "include" });
      const text = await res.text();
      const json = JSON.parse(text);
      if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load device");
      setDevice(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load device");
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    if (!device) return;
    setLoadingSettings(true);
    try {
      async function tryGet(url: string) {
        const r = await fetch(url, { credentials: "include" });
        const t = await r.text();
        let j: any = null;
        try {
          j = JSON.parse(t);
        } catch { }
        return { ok: r.ok, status: r.status, data: j };
      }

      const attempts = [
        () => tryGet(`${API_BASE}/devices/${device.id}/settings`),
        () => tryGet(`${API_BASE}/devices/${device.id}?view=settings`),
        () => tryGet(`${API_BASE}/devices/settings?id=${device.id}`),
      ];

      let resp: Awaited<ReturnType<typeof tryGet>> | null = null;
      for (const go of attempts) {
        resp = await go();
        if (resp.ok || resp.status !== 404) break;
      }

      if (!resp?.ok) throw new Error(resp?.data?.error || "Failed to load settings");

      const s: DeviceSettings = {
        callNumberStart: resp.data?.callNumberStart ?? "",
        callNumberReset: resp.data?.callNumberReset ?? "",
        defaultOrderType: resp.data?.defaultOrderType ?? "NONE",
        disabledOrderTypes: resp.data?.disabledOrderTypes ?? [],
        kitchenPrintLanguage: resp.data?.kitchenPrintLanguage ?? "EN",
        autoApplyOrderTags: resp.data?.autoApplyOrderTags ?? [],
        assignedTables: resp.data?.assignedTables ?? [],
        defaultPriceTag: resp.data?.defaultPriceTag ?? null,
        sendEodReportTo: resp.data?.sendEodReportTo ?? "",
        sendShiftReportTo: resp.data?.sendShiftReportTo ?? "",
        sendTillReportTo: resp.data?.sendTillReportTo ?? "",
        autoPair: !!resp.data?.autoPair,
        enableBarcodeScanners: !!resp.data?.enableBarcodeScanners,
        autoAcceptOnline: !!resp.data?.autoAcceptOnline,
        printOnlineInfo: !!resp.data?.printOnlineInfo,
        autoSendAheadToKitchen: !!resp.data?.autoSendAheadToKitchen,
        disableAutoReceiptPrint: !!resp.data?.disableAutoReceiptPrint,
        useCallNumberFromMaster: !!resp.data?.useCallNumberFromMaster,
        printDrawerOps: !!resp.data?.printDrawerOps,
        forceSelectPriceTag: !!resp.data?.forceSelectPriceTag,
        forceSelectSeat: !!resp.data?.forceSelectSeat,
      };

      setSettings(s);
    } catch (e: any) {
      setAlertMsg(e?.message || "Failed to load device settings");
    } finally {
      setLoadingSettings(false);
    }
  }

  async function saveSettings(next: DeviceSettings) {
    if (!device) return;
    setSavingSettings(true);

    const body = { ...next };

    async function tryReq(method: "PATCH" | "PUT" | "POST", url: string) {
      const needsId = url.endsWith("/devices/settings");
      const payload = needsId ? { id: device!.id, ...body } : body;

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { raw: txt };
      }
      return { ok: res.ok, status: res.status, data };
    }

    try {
      const attempts = [
        () => tryReq("PATCH", `${API_BASE}/devices/${device.id}/settings`),
        () => tryReq("PUT", `${API_BASE}/devices/${device.id}/settings`),
        () => tryReq("POST", `${API_BASE}/devices/${device.id}/settings`),
        () => tryReq("POST", `${API_BASE}/devices/${device.id}/update-settings`),
        () => tryReq("POST", `${API_BASE}/devices/settings`),
      ];

      let resp: Awaited<ReturnType<typeof tryReq>> | null = null;
      for (const go of attempts) {
        resp = await go();
        if (resp.ok || resp.status !== 404) break;
      }

      if (!resp?.ok) throw new Error(resp?.data?.error || "Failed to save settings");

      setSettings(next);
      setOpenSettings(false);
      setAlertMsg("Device settings updated successfully.");
    } catch (e: any) {
      setAlertMsg(e?.message || "Failed to save device settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function fetchBranches() {
    try {
      const br = await fetch(`${API_BASE}/branches?page=1&pageSize=200`, {
        credentials: "include",
      });
      const t = await br.text();
      let j: any = null;
      try {
        j = JSON.parse(t);
      } catch {
        j = null;
      }
      if (!br.ok) throw new Error(j?.error || "Failed to load branches");
      const arr: any[] = Array.isArray(j) ? j : j?.data ?? j?.items ?? [];
      setBranches(arr.map((b: any) => ({ id: String(b.id), name: String(b.name) })));
    } catch (e) {
      console.error("branches load failed", e);
      setBranches([]);
    }
  }

  useEffect(() => {
    fetchDevice();
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (device?.id) {
      loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id]);

  const uiType = device ? DEVICE_TYPE_API_TO_UI[device.type] || device.type : "";
  const isUsed = device?.status === "USED";
  const badgeText =
    (!isUsed && device?.activationCode) || device?.reference || device?.deviceCode || id;

  const badgeCls = isUsed ? "bg-red-600 text-white" : "bg-emerald-600 text-white";

  async function regenerateCode() {
    if (!device) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/devices/${device.id}/activation-code`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Failed to generate code");
      setDevice((prev) => (prev ? { ...prev, ...data } : prev));
      setAlertMsg("Activation code generated successfully.");
    } catch (e: any) {
      setAlertMsg(e?.message || "Failed to generate code");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!device) return;
    if (!confirm("Deactivate this device? The app will return to activation screen.")) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/devices/${device.id}/deactivate`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Failed to deactivate");
      setDevice((prev) =>
        prev
          ? {
              ...prev,
              status: "NOT_USED",
              activationCode: data.activationCode,
              activationCodeGeneratedAt: data.activationCodeGeneratedAt,
              updatedAt: data.updatedAt,
            }
          : prev
      );
      setAlertMsg("Device has been deactivated.");
    } catch (e: any) {
      setAlertMsg(e?.message || "Failed to deactivate");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(nextUi: "Used" | "Not Used") {
    if (!device) return;
    const next = STATUS_UI_TO_API[nextUi];

    if (next === "NOT_USED") {
      await deactivate();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/devices/${device.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "USED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Failed to update status");
      setDevice((prev) =>
        prev
          ? {
              ...prev,
              status: "USED",
              activationCode: null,
              activationCodeGeneratedAt: null,
              updatedAt: data.updatedAt ?? prev.updatedAt,
            }
          : prev
      );
      setAlertMsg("Status updated to Used.");
    } catch (e: any) {
      setAlertMsg(e?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdits(payload: {
    name: string;
    reference: string;
    type: string; // UI value
    branchId: string | "";
  }) {
    if (!device) return;
    setSavingEdit(true);

    // Normalize type + reference with correct prefix
    const uiType = payload.type;
    const apiType = DEVICE_TYPE_UI_TO_API[uiType] ?? payload.type;
    const prefix = DEVICE_TYPE_PREFIX[uiType] ?? "";

    let ref = payload.reference.trim();
    if (prefix) {
      const digits = ref.replace(/[^\d]/g, "");
      const num = digits ? Number(digits) : 1;
      const formatted = String(num).padStart(3, "0");
      ref = `${prefix}${formatted}`;
    }

    const body = {
      name: payload.name.trim(),
      reference: ref,
      type: apiType,
      branchId: payload.branchId || null,
    };

    async function tryReq(method: "PATCH" | "PUT" | "POST", url: string) {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const txt = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { raw: txt };
      }
      return { ok: res.ok, status: res.status, data };
    }

    try {
      const tries = [
        () => tryReq("PATCH", `${API_BASE}/devices/${device.id}`),
        () => tryReq("PUT", `${API_BASE}/devices/${device.id}`),
        () => tryReq("POST", `${API_BASE}/devices/${device.id}`),
        () => tryReq("POST", `${API_BASE}/devices/${device.id}/edit`),
        () => tryReq("POST", `${API_BASE}/devices/update`),
      ];

      let resp: Awaited<ReturnType<typeof tryReq>> | null = null;
      for (const t of tries) {
        resp = await t();
        if (resp.ok || resp.status !== 404) break;
      }

      if (!resp?.ok) {
        throw new Error(resp?.data?.error || resp?.data?.message || `Save failed (${resp?.status})`);
      }

      setDevice((prev) =>
        prev
          ? {
              ...prev,
              name: payload.name.trim(),
              reference: ref,
              type: apiType,
              branch: payload.branchId
                ? {
                    id: payload.branchId,
                    name: branches.find((b) => b.id === payload.branchId)?.name ?? null,
                  }
                : null,
              updatedAt: resp.data?.updatedAt ?? prev.updatedAt,
            }
          : prev
      );

      // Also persist current settings (so the online-orders toggle is saved)
      if (settings) {
        await saveSettings(settings);
      }

      setOpenEdit(false);
      setAlertMsg("Device saved successfully.");
    } catch (e: any) {
      setAlertMsg(e?.message || "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  // ===== Force Sync handler =====
  async function forceSync() {
    if (!device) return;
    setSyncing(true);
    setAlertMsg(null);

    async function tryReq(method: "POST" | "PUT", url: string, body?: any) {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const txt = await res.text();
      let data: any = null;
      try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      return { ok: res.ok, status: res.status, data };
    }

    try {
      const attempts = [
        () => tryReq("POST", `${API_BASE}/devices/${device.id}/force-sync`, { mode: "push_pull" }),
        () => tryReq("POST", `${API_BASE}/devices/${device.id}/sync`, { mode: "push_pull" }),
        () => tryReq("PUT", `${API_BASE}/devices/${device.id}/sync`, { mode: "push_pull" }),
        () => tryReq("POST", `${API_BASE}/devices/sync`, { id: device.id, mode: "push_pull" }),
      ];

      let resp: Awaited<ReturnType<typeof tryReq>> | null = null;
      for (const go of attempts) {
        resp = await go();
        if (resp.ok || resp.status !== 404) break;
      }

      if (!resp?.ok) {
        throw new Error(resp?.data?.error || resp?.data?.message || `Sync failed (${resp?.status})`);
      }

      await fetchDevice();
      await loadSettings();

      setAlertMsg("Sync started. The device is applying settings and pushing data to the server.");
    } catch (e: any) {
      setAlertMsg(e?.message || "Failed to start sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Top bar */}
      <button
        onClick={() => router.push("/devices")}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{device?.name ?? "Device"}</h1>

          {badgeText && (
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeCls}`}
              title={isUsed ? "Reference" : device?.activationCode ? "Activation Code" : "Reference"}
            >
              {badgeText}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={forceSync}
            disabled={syncing}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Force Sync Data"}
          </button>
          <button
            onClick={async () => {
              setOpenSettings(true);
              await loadSettings();
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Device Settings
          </button>
          <button
            onClick={() => setOpenEdit(true)}
            className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-900"
          >
            Edit Device
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading device...
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {device && !loading && (
        <>
          {/* Main card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="space-y-2">
                <InfoRow label="Reference" value={device.reference || device.deviceCode} />
                <InfoRow label="Branch" value={device.branch?.name ?? null} />
                <InfoRow label="App Version" value={"—"} />
                <InfoRow label="Menu Group" value={"—"} />
                <InfoRow label="Last Sync" value={device.createdAt ? new Date(device.createdAt).toLocaleString() : null} />
                <InfoRow label="Last Order" value={"—"} />
              </div>

              <div className="space-y-2">
                <InfoRow label="Type" value={DEVICE_TYPE_API_TO_UI[device.type] || device.type} />
                <InfoRow label="Model" value={"—"} />
                <InfoRow label="System Version" value={"—"} />
                <InfoRow
                  label="Receives Online Orders"
                  value={
                    settings
                      ? (settings.autoAcceptOnline ? "Yes" : "No")
                      : "—"
                  }
                />
                <InfoRow label="Last Online" value={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : null} />

                <InfoRow label="Last Updated" value={device.updatedAt ? new Date(device.updatedAt).toLocaleString() : null} />
                {device.status === "NOT_USED" && (
                  <InfoRow
                    label="Activation Code Created"
                    value={
                      device.activationCodeGeneratedAt
                        ? new Date(device.activationCodeGeneratedAt).toLocaleString()
                        : null
                    }
                  />
                )}
              </div>
            </div>
          </div>

          {/* Tags card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Tags</h2>
              <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Add Tags
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Add tags to help you filter and group devices easily. You can create tags such as Main Cashier, Waiter, etc.
            </p>
          </div>

          {/* Deactivate card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Deactivate Device</h2>
            <p className="text-xs text-gray-500 max-w-xl">
              Make sure all active orders are uploaded. You will lose all data on the device if you deactivate it. A new
              6-digit activation code will be generated and the mobile app will return to the activation screen.
            </p>
            <button
              onClick={deactivate}
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Working…" : "Deactivate Device"}
            </button>
          </div>
        </>
      )}

      {/* ===== Edit Device Modal ===== */}
      {openEdit && device && (
        <EditDeviceModal
          defaults={{
            name: device.name ?? "",
            reference: device.reference ?? device.deviceCode ?? "",
            type: DEVICE_TYPE_API_TO_UI[device.type] || "Cashier",
            branchId: device.branch?.id ?? "",
          }}
          branches={branches}
          saving={savingEdit}
          onClose={() => setOpenEdit(false)}
          onSave={(data) => saveEdits(data)}
          // wire checkbox to settings.autoAcceptOnline
          onlineOrdersEnabled={Boolean(settings?.autoAcceptOnline)}
          onToggleOnlineOrders={(v) =>
            setSettings((prev) => ({ ...(prev ?? ({} as DeviceSettings)), autoAcceptOnline: v }))
          }
        />
      )}

      {/* ===== Device Settings Sheet ===== */}
      {openSettings && (
        <DeviceSettingsSheet
          loading={loadingSettings}
          saving={savingSettings}
          values={
            settings ?? {
              disabledOrderTypes: [],
              autoApplyOrderTags: [],
              assignedTables: [],
            }
          }
          onChange={setSettings}
          onClose={() => setOpenSettings(false)}
          onSave={() => settings && saveSettings(settings)}
        />
      )}

      {/* ===== Alert Popup ===== */}
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </div>
  );
}

/* ===== Edit Modal Component ===== */
function EditDeviceModal({
  defaults,
  branches,
  saving,
  onClose,
  onSave,
  onlineOrdersEnabled,
  onToggleOnlineOrders,
}: {
  defaults: { name: string; reference: string; type: string; branchId: string | "" };
  branches: Branch[];
  saving: boolean;
  onClose: () => void;
  onSave: (data: { name: string; reference: string; type: string; branchId: string | "" }) => void;
  onlineOrdersEnabled: boolean;
  onToggleOnlineOrders: (v: boolean) => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [reference, setReference] = useState(defaults.reference);
  const [type, setType] = useState<string>(defaults.type);
  const [branchId, setBranchId] = useState<string>(defaults.branchId);

  const canSave = name.trim() && reference.trim() && type;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h3 className="text-lg font-semibold">Edit Device</h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
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
                    const prefix = DEVICE_TYPE_PREFIX[type] ?? "C";
                    const n = Number(reference.replace(/[^\d]/g, "")) || 0;
                    const next = String(n + 1).padStart(3, "0");
                    setReference(`${prefix}${next}`);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Generate
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Type <span className="text-rose-600">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setType(newType);
                  const prefix = DEVICE_TYPE_PREFIX[newType] ?? "C";
                  const digits = reference.replace(/[^\d]/g, "");
                  const num = digits ? Number(digits) : 1;
                  const formatted = String(num).padStart(3, "0");
                  setReference(`${prefix}${formatted}`);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              >
                {["Cashier", "KDS", "Notifier", "Display", "Sub Cashier"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Branch</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
              >
                <option value="">Unassigned</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Controlled checkbox writing to parent settings.autoAcceptOnline */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Receive online orders
              </label>
              <div className="mt-1">
                <input
                  type="checkbox"
                  checked={onlineOrdersEnabled}
                  onChange={(e) => onToggleOnlineOrders(e.target.checked)}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              disabled={saving}
            >
              Close
            </button>
            <button
              disabled={!canSave || saving}
              onClick={() =>
                canSave &&
                onSave({
                  name: name.trim(),
                  reference: reference.trim(),
                  type,
                  branchId,
                })
              }
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                canSave && !saving ? "bg-black text-white hover:bg-gray-900" : "bg-gray-200 text-gray-500 cursor-not-allowed"
              }`}
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving
                </span>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Simple Alert Popup ===== */
function AlertModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-sm text-center p-6 space-y-4">
        <p className="text-gray-800 text-sm font-medium">{message}</p>
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="rounded-lg bg-black px-5 py-2 text-sm text-white font-medium hover:bg-gray-900"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== Device Settings Side Sheet ===== */
function DeviceSettingsSheet({
  loading,
  saving,
  values,
  onChange,
  onClose,
  onSave,
}: {
  loading: boolean;
  saving: boolean;
  values: DeviceSettings;
  onChange: (v: DeviceSettings) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const ORDER_TYPES = [
    { id: "NONE", label: "None" },
    { id: "DINE_IN", label: "Dine In" },
    { id: "TAKEAWAY", label: "Takeaway" },
    { id: "DELIVERY", label: "Delivery" },
  ];
  const LANGUAGES = [
    { id: "EN", label: "English" },
    { id: "AR", label: "Arabic" },
    { id: "Multi", label: "Arabic & English" },
  ];

  function toggleInArray(key: keyof DeviceSettings, id: string) {
    const set = new Set((values[key] as string[]) || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...values, [key]: Array.from(set) });
  }

  const row = "flex flex-col gap-1";
  const label = "text-sm font-medium text-gray-700";
  const input =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600";

  return (
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-base font-semibold">Edit Device Settings</h3>
          <button className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center" onClick={onClose}>
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {loading ? (
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
            </div>
          ) : (
            <>
              <div className={row}>
                <label className={label}>Call Number Start</label>
                <input
                  className={input}
                  value={values.callNumberStart ?? ""}
                  onChange={(e) => onChange({ ...values, callNumberStart: e.target.value })}
                />
              </div>

              <div className={row}>
                <label className={label}>Call Number Reset</label>
                <input
                  className={input}
                  value={values.callNumberReset ?? ""}
                  onChange={(e) => onChange({ ...values, callNumberReset: e.target.value })}
                />
              </div>

              <div className={row}>
                <label className={label}>Default Order Type for New Orders</label>
                <select
                  className={input}
                  value={values.defaultOrderType ?? "NONE"}
                  onChange={(e) => onChange({ ...values, defaultOrderType: e.target.value })}
                >
                  {ORDER_TYPES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={row}>
                <label className={label}>Disabled Order Types</label>
                <div className="grid grid-cols-2 gap-2">
                  {ORDER_TYPES.filter((o) => o.id !== "NONE").map((o) => (
                    <label key={o.id} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(values.disabledOrderTypes || []).includes(o.id)}
                        onChange={() => toggleInArray("disabledOrderTypes", o.id)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className={row}>
                <label className={label}>Kitchen Print Language</label>
                <select
                  className={input}
                  value={values.kitchenPrintLanguage ?? "EN"}
                  onChange={(e) => onChange({ ...values, kitchenPrintLanguage: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={row}>
                <label className={label}>Auto Apply Order Tags</label>
                <input
                  className={input}
                  placeholder="Comma separated (e.g. VIP,NoOnions)"
                  value={(values.autoApplyOrderTags || []).join(",")}
                  onChange={(e) =>
                    onChange({
                      ...values,
                      autoApplyOrderTags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>

              <div className={row}>
                <label className={label}>Send End of Day Report To Email</label>
                <input
                  className={input}
                  placeholder="name@example.com"
                  value={values.sendEodReportTo ?? ""}
                  onChange={(e) => onChange({ ...values, sendEodReportTo: e.target.value })}
                />
              </div>

              <div className={row}>
                <label className={label}>Send Shift Report To Email</label>
                <input
                  className={input}
                  placeholder="name@example.com"
                  value={values.sendShiftReportTo ?? ""}
                  onChange={(e) => onChange({ ...values, sendShiftReportTo: e.target.value })}
                />
              </div>

              <div className={row}>
                <label className={label}>Send Till Report To Email</label>
                <input
                  className={input}
                  placeholder="name@example.com"
                  value={values.sendTillReportTo ?? ""}
                  onChange={(e) => onChange({ ...values, sendTillReportTo: e.target.value })}
                />
              </div>

              <div className={row}>
                <label className={label}>Default price tag</label>
                <input
                  className={input}
                  placeholder="e.g. Regular"
                  value={values.defaultPriceTag ?? ""}
                  onChange={(e) => onChange({ ...values, defaultPriceTag: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                {([
                  ["autoPair", "Auto Pair With Other Devices"],
                  ["enableBarcodeScanners", "Enable Barcode Scanners"],
                  ["autoAcceptOnline", "Auto Accept and Send Online Orders to Kitchen"],
                  ["printOnlineInfo", "Print Online Order Info When Received"],
                  ["autoSendAheadToKitchen", "Auto Send Ahead Order to Kitchen"],
                  ["disableAutoReceiptPrint", "Disable Automatic Receipt Printing"],
                  ["useCallNumberFromMaster", "Use Call Number from Master Cashier"],
                  ["printDrawerOps", "Print Drawer Operations"],
                  ["forceSelectPriceTag", "Force Select Price Tag"],
                  ["forceSelectSeat", "Force Select Seat"],
                ] as const).map(([key, text]) => (
                  <label key={key} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean((values as any)[key])}
                      onChange={(e) => onChange({ ...values, [key]: e.target.checked } as DeviceSettings)}
                    />
                    {text}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            Close
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${!saving ? "bg-black text-white hover:bg-gray-900" : "bg-gray-200 text-gray-500"
              }`}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving
              </span>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
