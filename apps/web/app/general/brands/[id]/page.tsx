"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

import { API_BASE, apiFetch } from "@/lib/api";

/* ------------------- helpers ------------------- */

function resolveUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return API_BASE + url;
}

/**
 * Upload image using the same endpoint you already have.
 * IMPORTANT:
 * - Do NOT set Content-Type manually for FormData.
 * - Use apiFetch so Authorization + 401 handling is consistent.
 */
async function uploadSettingImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const data = await apiFetch<{ url: string }>(`/upload/receipt-logo`, {
    method: "POST",
    body: form as any,
    // DO NOT send Content-Type for FormData
    headers: {},
  });

  return data.url;
}

/* -------------------- UI primitives -------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "pill" | "pill-active";
};

function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  let base =
    "inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1";

  if (variant === "primary") {
    base += " bg-black text-white hover:bg-black/80 focus:ring-black";
  } else if (variant === "pill-active") {
    base +=
      " bg-black text-white hover:bg-black/80 focus:ring-black rounded-full px-3 py-1 text-xs";
  } else if (variant === "pill") {
    base +=
      " bg-white text-black border border-gray-300 hover:bg-gray-100 rounded-full px-3 py-1 text-xs";
  } else {
    base += " bg-transparent text-gray-600 hover:bg-gray-100";
  }

  return (
    <button className={`${base} ${className}`} {...rest}>
      {children}
    </button>
  );
}

type CheckboxProps = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

function CheckboxRow({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/* ----------------------- types ------------------------ */

type PrintLanguage = "MAIN_LOCALIZED" | "MAIN_ONLY" | "LOCALIZED_ONLY";

type BrandSettings = {
  id?: string;

  // Receipt
  logoUrl?: string | null;
  printLanguage?: PrintLanguage;
  mainLanguage?: string;
  localizedLanguage?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  invoiceTitle?: string | null;
  showOrderNumber?: boolean;
  showCalories?: boolean;
  showSubtotal?: boolean;
  showRounding?: boolean;
  showCloserUsername?: boolean;
  showCreatorUsername?: boolean;
  showCheckNumber?: boolean;
  hideFreeModifierOptions?: boolean;
  printCustomerPhoneInPickup?: boolean;

  // Call Center
  agents?: string | null;
  acceptedPaymentModes?: string[];
  inactiveBranches?: string | null;
  menuGroup?: string | null;
  inactiveOrderTypes?: string | null;
  allowDiscounts?: boolean;
  allowCoupons?: boolean;
  allowEditingOrders?: boolean;
  allowVoidingActive?: boolean;
  allowReadAllCcOrders?: boolean;
  allowReadAllDcOrders?: boolean;
  allowPriceTags?: boolean;

  // Cashier
  presetTenderedAmounts?: string | null;
  tenderedAmountCurrencies?: string | null;
  predefinedTipPercentages?: string | null;
  uploadOrdersDelayMinutes?: number;
  inactiveUsersLogoutMinutes?: number;
  returnMode?: "LIMITED" | "NOT_ALLOWED" | "UNLIMITED";
  limitedReturnPeriodMinutes?: number | null;
  requireOrderTagsForOrders?: string | null;
  roundingMethod?: string | null;
  enableTips?: boolean;
  discountsRequireCustomerInfo?: boolean;
  voidRequiresCustomerInfo?: boolean;
  requireTableGuestForDineIn?: boolean;
  alwaysAskVoidReasons?: boolean;
  autoSendToKitchenAfterFullPayment?: boolean;
  autoDataSyncAtStartOfDay?: boolean;
  autoPrintProductMix?: boolean;
  autoPrintTillReports?: boolean;
  forceInventoryCountBeforeEndOfDay?: boolean;
  autoCloseKioskOrders?: boolean;
  preventSellingOutOfStock?: boolean;
  printPaymentReceiptsForActiveOrders?: boolean;
  singleTillMode?: boolean;
  requireCustomerInfoBeforeClosing?: boolean;

  // Display
  backgroundImageUrl?: string | null;

  // Kitchen
  sortingMethod?: string;
  showDefaultModifiersOnKds?: boolean;

  // Inventory
  inventoryLogoUrl?: string | null;
  inventoryHeader?: string | null;
  inventoryFooter?: string | null;
  restrictToAvailableQuantities?: boolean;
};

/* ---------------------- defaults ---------------------- */

const defaults: Required<
  Pick<
    BrandSettings,
    | "printLanguage"
    | "mainLanguage"
    | "localizedLanguage"
    | "logoUrl"
    | "receiptHeader"
    | "receiptFooter"
    | "invoiceTitle"
    | "showOrderNumber"
    | "showCalories"
    | "showSubtotal"
    | "showRounding"
    | "showCloserUsername"
    | "showCreatorUsername"
    | "showCheckNumber"
    | "hideFreeModifierOptions"
    | "printCustomerPhoneInPickup"
    | "agents"
    | "acceptedPaymentModes"
    | "inactiveBranches"
    | "menuGroup"
    | "inactiveOrderTypes"
    | "allowDiscounts"
    | "allowCoupons"
    | "allowEditingOrders"
    | "allowVoidingActive"
    | "allowReadAllCcOrders"
    | "allowReadAllDcOrders"
    | "allowPriceTags"
    | "presetTenderedAmounts"
    | "tenderedAmountCurrencies"
    | "predefinedTipPercentages"
    | "uploadOrdersDelayMinutes"
    | "inactiveUsersLogoutMinutes"
    | "returnMode"
    | "limitedReturnPeriodMinutes"
    | "requireOrderTagsForOrders"
    | "roundingMethod"
    | "enableTips"
    | "discountsRequireCustomerInfo"
    | "voidRequiresCustomerInfo"
    | "requireTableGuestForDineIn"
    | "alwaysAskVoidReasons"
    | "autoSendToKitchenAfterFullPayment"
    | "autoDataSyncAtStartOfDay"
    | "autoPrintProductMix"
    | "autoPrintTillReports"
    | "forceInventoryCountBeforeEndOfDay"
    | "autoCloseKioskOrders"
    | "preventSellingOutOfStock"
    | "printPaymentReceiptsForActiveOrders"
    | "singleTillMode"
    | "requireCustomerInfoBeforeClosing"
    | "backgroundImageUrl"
    | "sortingMethod"
    | "showDefaultModifiersOnKds"
    | "inventoryLogoUrl"
    | "inventoryHeader"
    | "inventoryFooter"
    | "restrictToAvailableQuantities"
  >
> = {
  // Receipt
  printLanguage: "MAIN_LOCALIZED",
  mainLanguage: "en",
  localizedLanguage: "ar",
  logoUrl: "",
  receiptHeader: "",
  receiptFooter: "",
  invoiceTitle: "Simplified Tax Invoice",
  showOrderNumber: true,
  showCalories: false,
  showSubtotal: true,
  showRounding: false,
  showCloserUsername: false,
  showCreatorUsername: false,
  showCheckNumber: true,
  hideFreeModifierOptions: false,
  printCustomerPhoneInPickup: false,

  // Call Center
  agents: "CallCenter",
  acceptedPaymentModes: ["CARD_ON_DELIVERY", "CASH_ON_DELIVERY"],
  inactiveBranches: "",
  menuGroup: "",
  inactiveOrderTypes: "",
  allowDiscounts: true,
  allowCoupons: false,
  allowEditingOrders: false,
  allowVoidingActive: false,
  allowReadAllCcOrders: true,
  allowReadAllDcOrders: true,
  allowPriceTags: false,

  // Cashier
  presetTenderedAmounts: "",
  tenderedAmountCurrencies: "",
  predefinedTipPercentages: "",
  uploadOrdersDelayMinutes: 0,
  inactiveUsersLogoutMinutes: 30,
  returnMode: "LIMITED",
  limitedReturnPeriodMinutes: 21600,
  requireOrderTagsForOrders: "",
  roundingMethod: "NONE",
  enableTips: false,
  discountsRequireCustomerInfo: false,
  voidRequiresCustomerInfo: false,
  requireTableGuestForDineIn: false,
  alwaysAskVoidReasons: false,
  autoSendToKitchenAfterFullPayment: true,
  autoDataSyncAtStartOfDay: false,
  autoPrintProductMix: true,
  autoPrintTillReports: false,
  forceInventoryCountBeforeEndOfDay: false,
  autoCloseKioskOrders: false,
  preventSellingOutOfStock: false,
  printPaymentReceiptsForActiveOrders: false,
  singleTillMode: false,
  requireCustomerInfoBeforeClosing: false,

  // Display
  backgroundImageUrl: "",

  // Kitchen
  sortingMethod: "MENU_CATEGORY",
  showDefaultModifiersOnKds: false,

  // Inventory
  inventoryLogoUrl: "",
  inventoryHeader: "",
  inventoryFooter: "",
  restrictToAvailableQuantities: false,
};

/* --------------------- main page ---------------------- */

type TabKey =
  | "receipt"
  | "callCenter"
  | "cashier"
  | "display"
  | "kitchen"
  | "payments"
  | "sms"
  | "inventory";

const tabs: { key: TabKey; label: string }[] = [
  { key: "receipt", label: "Receipt" },
  { key: "callCenter", label: "Call Center" },
  { key: "cashier", label: "Cashier App" },
  { key: "display", label: "Display App" },
  { key: "kitchen", label: "Kitchen" },
  { key: "payments", label: "Payment Integrations" },
  { key: "sms", label: "SMS Providers" },
  { key: "inventory", label: "Inventory Transactions" },
];

export default function BrandSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const brandId = useMemo(() => String((params as any)?.id || ""), [params]);
  const [activeTab, setActiveTab] = useState<TabKey>("receipt");

  if (!brandId) {
    return (
      <div className="p-6 text-sm text-red-600">Missing brand id in route.</div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          ← Back
        </button>
      </div>

      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="mb-4 border-b border-gray-200 flex gap-4 text-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 ${
                isActive
                  ? "border-b-2 border-black text-black font-medium"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "receipt" && <ReceiptSettingsForm brandId={brandId} />}
      {activeTab === "callCenter" && <CallCenterSettingsForm brandId={brandId} />}
      {activeTab === "cashier" && <CashierSettingsForm brandId={brandId} />}
      {activeTab === "display" && <DisplaySettingsForm brandId={brandId} />}
      {activeTab === "kitchen" && <KitchenSettingsForm brandId={brandId} />}
      {activeTab === "payments" && <PaymentIntegrationsStub />}
      {activeTab === "sms" && <SmsProvidersStub />}
      {activeTab === "inventory" && <InventorySettingsForm brandId={brandId} />}
    </div>
  );
}

/* ---------------- receipt form component --------------- */

const printLanguageOptions: { value: PrintLanguage; label: string }[] = [
  { value: "MAIN_LOCALIZED", label: "Main & Localized" },
  { value: "MAIN_ONLY", label: "Main Only" },
  { value: "LOCALIZED_ONLY", label: "Localized Only" },
];

const languageOptions = [
  { value: "en", label: "English" },
  { value: "ar", label: "عربي" },
];

function ReceiptSettingsForm({ brandId }: { brandId: string }) {
  const [form, setForm] = useState<BrandSettings>({ ...defaults });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch<BrandSettings>(`/brand-settings/${brandId}`);
        if (!cancelled && data) {
          setForm({
            ...defaults,
            ...data,
            logoUrl: data.logoUrl || "",
            receiptHeader: data.receiptHeader || "",
            receiptFooter: data.receiptFooter || "",
            invoiceTitle: data.invoiceTitle || defaults.invoiceTitle,
          });
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  function setField<K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const receiptPayload: Partial<BrandSettings> = {
        logoUrl: form.logoUrl ?? "",
        printLanguage: form.printLanguage,
        mainLanguage: form.mainLanguage,
        localizedLanguage: form.localizedLanguage,
        receiptHeader: form.receiptHeader,
        receiptFooter: form.receiptFooter,
        invoiceTitle: form.invoiceTitle,
        showOrderNumber: form.showOrderNumber,
        showCalories: form.showCalories,
        showSubtotal: form.showSubtotal,
        showRounding: form.showRounding,
        showCloserUsername: form.showCloserUsername,
        showCreatorUsername: form.showCreatorUsername,
        showCheckNumber: form.showCheckNumber,
        hideFreeModifierOptions: form.hideFreeModifierOptions,
        printCustomerPhoneInPickup: form.printCustomerPhoneInPickup,
      };

      await apiFetch(`/brand-settings/${brandId}`, {
        method: "POST",
        body: JSON.stringify(receiptPayload),
      });

      setMessage("Receipt settings saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Receipt Settings</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading settings...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Logo */}
          <div>
            <label className="block text-sm font-medium mb-1">Receipt Logo</label>

            {form.logoUrl ? (
              <div className="mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveUrl(form.logoUrl)}
                  alt="Logo"
                  className="h-16 border rounded p-1 bg-white"
                />
                <button
                  type="button"
                  className="text-red-600 text-xs mt-1"
                  onClick={() => setField("logoUrl", "")}
                >
                  Remove
                </button>
              </div>
            ) : null}

            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setSaving(true);
                  const url = await uploadSettingImage(file);
                  setField("logoUrl", url);
                } catch (err: any) {
                  alert(err?.message || "Upload failed");
                } finally {
                  setSaving(false);
                }
              }}
              className="mt-1 text-sm"
            />
          </div>

          {/* languages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Print Language</label>
              <select
                value={form.printLanguage || defaults.printLanguage}
                onChange={(e) => setField("printLanguage", e.target.value as PrintLanguage)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
              >
                {printLanguageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Main Language</label>
              <select
                value={form.mainLanguage || defaults.mainLanguage}
                onChange={(e) => setField("mainLanguage", e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
              >
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Localized Language</label>
              <select
                value={form.localizedLanguage ?? defaults.localizedLanguage}
                onChange={(e) => setField("localizedLanguage", e.target.value || null)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
              >
                <option value="">None</option>
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* header/footer/title */}
          <div>
            <label className="block text-sm font-medium mb-1">Receipt Header</label>
            <textarea
              rows={3}
              value={form.receiptHeader || ""}
              onChange={(e) => setField("receiptHeader", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Receipt Footer</label>
            <textarea
              rows={3}
              value={form.receiptFooter || ""}
              onChange={(e) => setField("receiptFooter", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Invoice Title</label>
            <input
              type="text"
              value={form.invoiceTitle || ""}
              onChange={(e) => setField("invoiceTitle", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
            />
          </div>

          {/* checkboxes */}
          <div className="border-t border-gray-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <CheckboxRow label="Show Order Number" checked={!!form.showOrderNumber} onChange={(v) => setField("showOrderNumber", v)} />
            <CheckboxRow label="Show Calories" checked={!!form.showCalories} onChange={(v) => setField("showCalories", v)} />
            <CheckboxRow label="Show Subtotal" checked={!!form.showSubtotal} onChange={(v) => setField("showSubtotal", v)} />
            <CheckboxRow label="Show Rounding" checked={!!form.showRounding} onChange={(v) => setField("showRounding", v)} />
            <CheckboxRow label="Show Closer Username" checked={!!form.showCloserUsername} onChange={(v) => setField("showCloserUsername", v)} />
            <CheckboxRow label="Show Creator Username" checked={!!form.showCreatorUsername} onChange={(v) => setField("showCreatorUsername", v)} />
            <CheckboxRow label="Show Check Number" checked={!!form.showCheckNumber} onChange={(v) => setField("showCheckNumber", v)} />
            <CheckboxRow label="Hide Free Modifier Options" checked={!!form.hideFreeModifierOptions} onChange={(v) => setField("hideFreeModifierOptions", v)} />
            <CheckboxRow label="Print customer phone number in pickup orders" checked={!!form.printCustomerPhoneInPickup} onChange={(v) => setField("printCustomerPhoneInPickup", v)} />
          </div>

          {message && (
            <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
              {message}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ----------------- Call Center form ------------------- */

const PAYMENT_MODE_OPTIONS = [
  { value: "CARD_ON_DELIVERY", label: "Card on Delivery" },
  { value: "CASH_ON_DELIVERY", label: "Cash on Delivery" },
  { value: "ONLINE_PAYMENT", label: "Online Payment" },
];

function CallCenterSettingsForm({ brandId }: { brandId: string }) {
  const [form, setForm] = useState<BrandSettings>({ ...defaults });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch<BrandSettings>(`/brand-settings/${brandId}`);
        if (!cancelled && data) {
          setForm({
            ...defaults,
            ...data,
            acceptedPaymentModes: data.acceptedPaymentModes || defaults.acceptedPaymentModes,
          });
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  function setField<K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePaymentMode(value: string) {
    setForm((prev) => {
      const current = prev.acceptedPaymentModes || [];
      const exists = current.includes(value);
      return {
        ...prev,
        acceptedPaymentModes: exists ? current.filter((m) => m !== value) : [...current, value],
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const payload: Partial<BrandSettings> = {
        agents: form.agents ?? "",
        acceptedPaymentModes: form.acceptedPaymentModes ?? [],
        inactiveBranches: form.inactiveBranches ?? "",
        menuGroup: form.menuGroup ?? "",
        inactiveOrderTypes: form.inactiveOrderTypes ?? "",
        allowDiscounts: !!form.allowDiscounts,
        allowCoupons: !!form.allowCoupons,
        allowEditingOrders: !!form.allowEditingOrders,
        allowVoidingActive: !!form.allowVoidingActive,
        allowReadAllCcOrders: !!form.allowReadAllCcOrders,
        allowReadAllDcOrders: !!form.allowReadAllDcOrders,
        allowPriceTags: !!form.allowPriceTags,
      };

      await apiFetch(`/brand-settings/${brandId}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setMessage("Call Center settings saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Call Center Ordering Settings</h2>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading settings...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Agents</label>
            <input
              type="text"
              value={form.agents || ""}
              onChange={(e) => setField("agents", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Accepted Payment Modes</label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_MODE_OPTIONS.map((opt) => {
                const active = (form.acceptedPaymentModes || []).includes(opt.value);
                return (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={active ? "pill-active" : "pill"}
                    onClick={() => togglePaymentMode(opt.value)}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <CheckboxRow label="Allow Discounts" checked={!!form.allowDiscounts} onChange={(v) => setField("allowDiscounts", v)} />
            <CheckboxRow label="Allow Coupons" checked={!!form.allowCoupons} onChange={(v) => setField("allowCoupons", v)} />
            <CheckboxRow label="Allow Editing Orders" checked={!!form.allowEditingOrders} onChange={(v) => setField("allowEditingOrders", v)} />
            <CheckboxRow label="Allow Voiding Active Orders" checked={!!form.allowVoidingActive} onChange={(v) => setField("allowVoidingActive", v)} />
            <CheckboxRow label="Allow agents to read all CC Orders" checked={!!form.allowReadAllCcOrders} onChange={(v) => setField("allowReadAllCcOrders", v)} />
            <CheckboxRow label="Allow agents to read all DC Orders" checked={!!form.allowReadAllDcOrders} onChange={(v) => setField("allowReadAllDcOrders", v)} />
            <CheckboxRow label="Allow Price Tags" checked={!!form.allowPriceTags} onChange={(v) => setField("allowPriceTags", v)} />
          </div>

          {message && <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ----------------- other tabs keep existing UI ------------------- */
/* For brevity, keep your existing Cashier/Display/Kitchen/Inventory stub UIs
   OR convert them the same way (apiFetch instead of fetchJson).
   If you want, paste the rest of the file and I’ll convert 100% of it. */

function CashierSettingsForm({ brandId }: { brandId: string }) {
  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-2xl">
      <div className="text-sm text-gray-600">
        Paste your existing CashierSettingsForm here, and I will convert it to apiFetch
        without changing UI.
      </div>
    </div>
  );
}

function DisplaySettingsForm({ brandId }: { brandId: string }) {
  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-2xl">
      <div className="text-sm text-gray-600">
        Paste your existing DisplaySettingsForm here, and I will convert it to apiFetch
        without changing UI.
      </div>
    </div>
  );
}

function KitchenSettingsForm({ brandId }: { brandId: string }) {
  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-2xl">
      <div className="text-sm text-gray-600">
        Paste your existing KitchenSettingsForm here, and I will convert it to apiFetch
        without changing UI.
      </div>
    </div>
  );
}

function PaymentIntegrationsStub() {
  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-xl">
      <h2 className="text-lg font-semibold mb-4">Payment Integrations Settings</h2>
      <div className="flex items-center justify-between border rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded bg-purple-50 flex items-center justify-center text-xs font-bold">
            STC
          </div>
          <div className="text-sm font-medium">STCPay</div>
        </div>
        <Button type="button" variant="primary">
          Settings
        </Button>
      </div>
    </div>
  );
}

function SmsProvidersStub() {
  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-xl">
      <h2 className="text-lg font-semibold mb-4">SMS Providers Settings</h2>
      <div className="border rounded-lg px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-yellow-100 flex items-center justify-center text-lg font-bold">
              !
            </div>
            <div className="text-sm font-medium">Msegat</div>
          </div>
          <Button type="button" variant="primary">
            Settings
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          To activate, please sign up on Msegat.com first. If you already have an account,
          please link your API key by clicking on &quot;Settings&quot;.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Inventory settings ------------------ */

function InventorySettingsForm({ brandId }: { brandId: string }) {
  const [form, setForm] = useState<BrandSettings>({ ...defaults });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchJson<BrandSettings>(`${API_BASE}/brand-settings/${brandId}`);
        if (!cancelled && data) setForm({ ...defaults, ...data });
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  function setField<K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSaving(true);
      const url = await uploadSettingImage(file);
      setField("inventoryLogoUrl", url);
    } catch {
      alert("Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await fetchJson(`${API_BASE}/brand-settings/${brandId}`, {
        method: "POST",
        body: JSON.stringify({
          inventoryLogoUrl: form.inventoryLogoUrl ?? "",
          inventoryHeader: form.inventoryHeader ?? "",
          inventoryFooter: form.inventoryFooter ?? "",
          restrictToAvailableQuantities: !!form.restrictToAvailableQuantities,
        }),
      });
      setMessage("Inventory Transactions settings saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="bg-white shadow-sm rounded-lg p-6 max-w-xl">
      <h2 className="text-lg font-semibold mb-4">Inventory Transactions</h2>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading settings...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Upload Logo</label>
            {form.inventoryLogoUrl ? (
              <div className="mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveUrl(form.inventoryLogoUrl)}
                  alt="Inventory logo"
                  className="h-16 border rounded bg-white"
                />
                <button
                  type="button"
                  className="text-red-600 text-xs mt-1"
                  onClick={() => setField("inventoryLogoUrl", "")}
                >
                  Remove
                </button>
              </div>
            ) : null}
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="mt-1 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Header</label>
            <textarea
              rows={3}
              value={form.inventoryHeader || ""}
              onChange={(e) => setField("inventoryHeader", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Footer</label>
            <textarea
              rows={3}
              value={form.inventoryFooter || ""}
              onChange={(e) => setField("inventoryFooter", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
            />
          </div>

          <CheckboxRow
            label="Restrict inventory transactions to available quantities (Prevent Negative Stock)"
            checked={!!form.restrictToAvailableQuantities}
            onChange={(v) => setField("restrictToAvailableQuantities", v)}
          />

          {message && <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
