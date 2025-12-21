// apps/web/app/marketing/promotions/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { authStore } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

/* ----------------------------- auth + fetch ----------------------------- */

function getToken() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("pos_token") ||
    ""
  );
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const res = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
    credentials: "include",
  });

  // ✅ central 401 handling (same fix as your other pages)
  if (res.status === 401) {
    authStore.expire("Session expired. Please log in again.");
    throw new Error("Unauthorized");
  }

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore parse errors, we fallback to text
  }

  if (!res.ok) {
    const message =
      (json && (json.message || json.error)) ||
      text ||
      `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  // empty body safe return
  return (json ?? ({} as any)) as T;
}

/* ------------------------------ data types ----------------------------- */

const ALL_WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
type Weekday = (typeof ALL_WEEKDAYS)[number];

type PromotionStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE" | string;
type PromotionType = "BASIC" | "ADVANCED";
type DiscountType = "VALUE" | "PERCENT";
type ConditionKind = "BUYS_QUANTITY" | "SPENDS_AMOUNT";
type RewardKind = "DISCOUNT_ON_ORDER" | "DISCOUNT_ON_PRODUCT" | "PAY_FIXED_AMOUNT";

/* shape returned by GET /promotions/:id */
type PromotionDetail = {
  id: string;
  name: string;
  nameLocalized?: string | null;
  description?: string | null;

  status?: PromotionStatus;
  isActive?: boolean;
  active?: boolean; // backward compatibility

  startDate?: string | null; // ISO
  endDate?: string | null; // ISO
  startTime?: string | null; // "07:00"
  endTime?: string | null;

  days?: Weekday[];
  orderTypes?: string[];

  priority?: number | null;
  includeModifiers?: boolean;

  promotionType?: PromotionType;
  basicDiscountType?: DiscountType | null;
  basicDiscountValue?: number | null;

  // advanced
  conditionKind?: ConditionKind | null;
  conditionQty?: number | null;
  conditionSpend?: number | null;
  rewardKind?: RewardKind | null;
  rewardDiscountType?: DiscountType | null;
  rewardDiscountValue?: number | null;
  rewardFixedAmount?: number | null;

  productSizeIds?: string[];
  branchIds?: string[];

  createdAt?: string;
  updatedAt?: string;
};

/* product size option for selector */
type ProductSizeOption = {
  id: string;
  label: string; // e.g. "Strawberry - Large"
};

/* branch option for selector */
type BranchOption = {
  id: string;
  name: string;
};

/* form shape for create/update */
type PromotionForm = {
  name: string;
  nameLocalized: string;
  description: string;
  status: PromotionStatus;
  active: boolean;

  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm

  days: Weekday[];
  orderTypes: string[];

  priority: string;
  includeModifiers: boolean;

  promotionType: PromotionType;

  // BASIC
  discountType: DiscountType;
  discountAmount: string;

  // ADVANCED
  conditionKind: ConditionKind;
  conditionQty: string;
  conditionSpend: string;
  rewardKind: RewardKind;
  rewardDiscountType: DiscountType;
  rewardDiscountValue: string;
  rewardFixedAmount: string;

  // selected ids
  products: string[]; // productSizeIds
  branches: string[]; // branchIds
};

function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* --------------------------------- page -------------------------------- */

export default function PromotionEditPage() {
  const params = useParams();
  const router = useRouter();

  const id = (params?.id as string) || "";
  const isNew = id === "new";

  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [form, setForm] = useState<PromotionForm>({
    name: "",
    nameLocalized: "",
    description: "",
    status: "ACTIVE",
    active: true,

    startDate: "",
    endDate: "",
    startTime: "07:00",
    endTime: "23:59",

    days: [...ALL_WEEKDAYS],
    orderTypes: ["DINE_IN"],

    priority: "",
    includeModifiers: false,

    promotionType: "BASIC",

    discountType: "VALUE",
    discountAmount: "",

    conditionKind: "BUYS_QUANTITY",
    conditionQty: "",
    conditionSpend: "",
    rewardKind: "DISCOUNT_ON_ORDER",
    rewardDiscountType: "VALUE",
    rewardDiscountValue: "",
    rewardFixedAmount: "",

    products: [],
    branches: [],
  });

  /* ------------ product size selector state ------------ */

  const [sizeOptions, setSizeOptions] = useState<ProductSizeOption[]>([]);
  const [sizeLoading, setSizeLoading] = useState(false);
  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const [sizeSearch, setSizeSearch] = useState("");

  const selectedSizeOptions = useMemo(
    () =>
      form.products
        .map((pid) => sizeOptions.find((opt) => opt.id === pid))
        .filter(Boolean) as ProductSizeOption[],
    [form.products, sizeOptions]
  );

  async function loadProductSizesOnce() {
    if (sizeOptions.length > 0 || sizeLoading) return;
    try {
      setSizeLoading(true);

      // keep your endpoint as-is
      const apiData = await fetchJson<
        { id: string; name?: string; productName?: string; sizeName?: string }[]
      >(`${API_BASE}/product-sizes`);

      const mapped: ProductSizeOption[] = (apiData || []).map((p) => {
        const base =
          p.sizeName && p.productName
            ? `${p.productName} - ${p.sizeName}`
            : p.productName
            ? `${p.productName} ${p.name ?? ""}`.trim()
            : p.name || "Unnamed size";
        return { id: p.id, label: base };
      });

      setSizeOptions(mapped);
    } catch (err) {
      console.error("Failed to load product sizes", err);
    } finally {
      setSizeLoading(false);
    }
  }

  const filteredSizeOptions = useMemo(() => {
    if (!sizeSearch.trim()) return sizeOptions;
    const q = sizeSearch.toLowerCase();
    return sizeOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [sizeSearch, sizeOptions]);

  function toggleProductSize(pid: string) {
    setForm((prev) => {
      const exists = prev.products.includes(pid);
      const products = exists
        ? prev.products.filter((x) => x !== pid)
        : [...prev.products, pid];
      return { ...prev, products };
    });
  }

  function clearProductSizes() {
    setForm((prev) => ({ ...prev, products: [] }));
  }

  /* ------------ branch selector state ------------ */

  const [branchOptions, setBranchOptions] = useState<BranchOption[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  const selectedBranchOptions = useMemo(
    () =>
      form.branches
        .map((bid) => branchOptions.find((b) => b.id === bid))
        .filter(Boolean) as BranchOption[],
    [form.branches, branchOptions]
  );

  async function loadBranchesOnce() {
    if (branchOptions.length > 0 || branchLoading) return;

    try {
      setBranchLoading(true);

      const raw = await fetchJson<any>(`${API_BASE}/branches?take=500&skip=0`);

      let items: { id: string; name: string }[] = [];

      if (Array.isArray(raw?.items)) items = raw.items;
      else if (Array.isArray(raw)) items = raw;
      else if (Array.isArray(raw?.branches)) items = raw.branches;
      else if (Array.isArray(raw?.data)) items = raw.data;

      const normalized: BranchOption[] = (items || []).map((b) => ({
        id: b.id,
        name: b.name,
      }));

      setBranchOptions(normalized);
    } catch (err) {
      console.error("Failed to load branches", err);
      setBranchOptions([]);
    } finally {
      setBranchLoading(false);
    }
  }

  const filteredBranchOptions = useMemo(() => {
    if (!branchSearch.trim()) return branchOptions;
    const q = branchSearch.toLowerCase();
    return branchOptions.filter((b) => b.name.toLowerCase().includes(q));
  }, [branchSearch, branchOptions]);

  function toggleBranch(bid: string) {
    setForm((prev) => {
      const exists = prev.branches.includes(bid);
      const branches = exists
        ? prev.branches.filter((x) => x !== bid)
        : [...prev.branches, bid];
      return { ...prev, branches };
    });
  }

  function clearBranches() {
    setForm((prev) => ({ ...prev, branches: [] }));
  }

  const pageTitle = isNew ? "New Promotion" : "Edit Promotion";

  /* --------------------------- load existing data --------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (isNew) {
        setInitialLoaded(true);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await fetchJson<PromotionDetail>(`${API_BASE}/promotions/${id}`);
        if (cancelled) return;

        setForm((prev) => ({
          ...prev,
          name: data.name || "",
          nameLocalized: data.nameLocalized || "",
          description: data.description || "",
          status: data.status || (data.active || data.isActive ? "ACTIVE" : "INACTIVE"),
          active: Boolean(data.active ?? data.isActive ?? data.status === "ACTIVE"),
          startDate: toDateInputValue(data.startDate),
          endDate: toDateInputValue(data.endDate),
          startTime: data.startTime || prev.startTime,
          endTime: data.endTime || prev.endTime,
          days: data.days && data.days.length > 0 ? (data.days as Weekday[]) : prev.days,
          orderTypes:
            data.orderTypes && data.orderTypes.length > 0 ? data.orderTypes : prev.orderTypes,
          priority: typeof data.priority === "number" ? String(data.priority) : "",
          includeModifiers:
            typeof data.includeModifiers === "boolean" ? data.includeModifiers : prev.includeModifiers,
          promotionType: data.promotionType || prev.promotionType,
          discountType: (data.basicDiscountType || prev.discountType) as DiscountType,
          discountAmount:
            typeof data.basicDiscountValue === "number" ? String(data.basicDiscountValue) : prev.discountAmount,
          conditionKind: (data.conditionKind || prev.conditionKind) as ConditionKind,
          conditionQty: typeof data.conditionQty === "number" ? String(data.conditionQty) : prev.conditionQty,
          conditionSpend:
            typeof data.conditionSpend === "number" ? String(data.conditionSpend) : prev.conditionSpend,
          rewardKind: (data.rewardKind || prev.rewardKind) as RewardKind,
          rewardDiscountType: (data.rewardDiscountType || prev.rewardDiscountType) as DiscountType,
          rewardDiscountValue:
            typeof data.rewardDiscountValue === "number" ? String(data.rewardDiscountValue) : prev.rewardDiscountValue,
          rewardFixedAmount:
            typeof data.rewardFixedAmount === "number" ? String(data.rewardFixedAmount) : prev.rewardFixedAmount,
          products: data.productSizeIds ?? prev.products,
          branches: data.branchIds ?? prev.branches,
        }));

        setInitialLoaded(true);
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setError(err?.message || "Failed to load promotion");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // auto-load options if there are selected ids (so tags show names)
  useEffect(() => {
    if (!initialLoaded) return;
    if (form.products.length) loadProductSizesOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoaded, form.products.length]);

  useEffect(() => {
    if (!initialLoaded) return;
    if (form.branches.length) loadBranchesOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoaded, form.branches.length]);

  /* ----------------------------- form helpers ----------------------------- */

  const handleChange =
    (field: keyof PromotionForm) =>
    (
      e:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLTextAreaElement>
        | React.ChangeEvent<HTMLSelectElement>
    ) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const value =
        field === "active" || field === "includeModifiers"
          ? (target as HTMLInputElement).checked
          : target.value;

      setForm((prev) => ({ ...prev, [field]: value as any }));
      setSuccessMessage(null);
      setError(null);
    };

  function toggleDay(day: Weekday) {
    setForm((prev) => {
      const exists = prev.days.includes(day);
      const days = exists ? prev.days.filter((d) => d !== day) : [...prev.days, day];
      return { ...prev, days };
    });
  }

  function toggleOrderType(value: string) {
    setForm((prev) => {
      const exists = prev.orderTypes.includes(value);
      const orderTypes = exists ? prev.orderTypes.filter((t) => t !== value) : [...prev.orderTypes, value];
      return { ...prev, orderTypes };
    });
  }

  function setPromotionType(type: PromotionType) {
    setForm((prev) => ({ ...prev, promotionType: type }));
  }
  function setDiscountType(type: DiscountType) {
    setForm((prev) => ({ ...prev, discountType: type }));
  }
  function setConditionKind(kind: ConditionKind) {
    setForm((prev) => ({ ...prev, conditionKind: kind }));
  }
  function setRewardKind(kind: RewardKind) {
    setForm((prev) => ({ ...prev, rewardKind: kind }));
  }
  function setRewardDiscountType(type: DiscountType) {
    setForm((prev) => ({ ...prev, rewardDiscountType: type }));
  }

  const handleSave = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError("Start and End dates are required.");
      return;
    }

    setSaving(true);
    try {
      const priorityNumber = form.priority ? Number(form.priority) : null;

      const payload: any = {
        name: form.name.trim(),
        nameLocalized: form.nameLocalized.trim() || null,
        description: form.description.trim() || null,
        isActive: form.active,

        startDate: form.startDate,
        endDate: form.endDate,
        startTime: form.startTime || null,
        endTime: form.endTime || null,

        days: form.days,
        orderTypes: form.orderTypes,

        priority:
          typeof priorityNumber === "number" && !Number.isNaN(priorityNumber) ? priorityNumber : null,
        includeModifiers: form.includeModifiers,

        promotionType: form.promotionType,

        // BASIC
        basicDiscountType: form.promotionType === "BASIC" ? form.discountType : null,
        basicDiscountValue:
          form.promotionType === "BASIC" && form.discountAmount !== ""
            ? Number(form.discountAmount)
            : null,

        // ADVANCED
        conditionKind: form.promotionType === "ADVANCED" ? form.conditionKind : null,
        conditionQty:
          form.promotionType === "ADVANCED" &&
          form.conditionKind === "BUYS_QUANTITY" &&
          form.conditionQty !== ""
            ? Number(form.conditionQty)
            : null,
        conditionSpend:
          form.promotionType === "ADVANCED" &&
          form.conditionKind === "SPENDS_AMOUNT" &&
          form.conditionSpend !== ""
            ? Number(form.conditionSpend)
            : null,

        rewardKind: form.promotionType === "ADVANCED" ? form.rewardKind : null,
        rewardDiscountType:
          form.promotionType === "ADVANCED" &&
          (form.rewardKind === "DISCOUNT_ON_ORDER" || form.rewardKind === "DISCOUNT_ON_PRODUCT")
            ? form.rewardDiscountType
            : null,
        rewardDiscountValue:
          form.promotionType === "ADVANCED" &&
          (form.rewardKind === "DISCOUNT_ON_ORDER" || form.rewardKind === "DISCOUNT_ON_PRODUCT") &&
          form.rewardDiscountValue !== ""
            ? Number(form.rewardDiscountValue)
            : null,
        rewardFixedAmount:
          form.promotionType === "ADVANCED" &&
          form.rewardKind === "PAY_FIXED_AMOUNT" &&
          form.rewardFixedAmount !== ""
            ? Number(form.rewardFixedAmount)
            : null,

        productSizeIds: form.products,
        branchIds: form.branches,
      };

      if (isNew) {
        const created = await fetchJson<PromotionDetail>(`${API_BASE}/promotions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccessMessage("Promotion created successfully.");
        router.replace(`/marketing/promotions/${created.id}`);
      } else {
        await fetchJson<PromotionDetail>(`${API_BASE}/promotions/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSuccessMessage("Promotion updated successfully.");
      }
    } catch (err: any) {
      if (String(err?.message || "").toLowerCase().includes("unauthorized")) {
        // authStore.expire already ran
      } else {
        console.error(err);
        setError(err?.message || "Failed to save promotion");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/marketing/promotions");
  };

  const headerSubtitle = useMemo(() => {
    if (isNew) return "Create a new marketing promotion.";
    return "Edit promotion settings and schedule.";
  }, [isNew]);

  const ORDER_TYPE_OPTIONS = [
    { value: "DINE_IN", label: "Dine In" },
    { value: "PICKUP", label: "Pickup" },
    { value: "DELIVERY", label: "Delivery" },
    { value: "DRIVE_THRU", label: "Drive Thru" },
  ];

  /* --------------------------------- UI --------------------------------- */

  return (
    <div className="flex-1 p-6">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">{pageTitle}</h1>
            <p className="text-sm text-gray-500">{headerSubtitle}</p>
          </div>
        </div>
      </div>

      {/* Main card */}
      <div className="flex h-[calc(100vh-11rem)] flex-col rounded-xl border bg-white shadow-sm">
        {/* Card body (scrollable) */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {loading && !initialLoaded && (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading promotion…
              </div>
            </div>
          )}

          {!loading && error && !initialLoaded && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {initialLoaded && (
            <form className="max-w-5xl space-y-6" onSubmit={handleSave}>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {successMessage}
                </div>
              )}

              {/* Basic details */}
              <section className="rounded-xl border bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-800">Basic Details</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={handleChange("name")}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                      placeholder="Monthly Promotion"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Name Localized
                    </label>
                    <input
                      type="text"
                      value={form.nameLocalized}
                      onChange={handleChange("nameLocalized")}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                      placeholder="العرض الشهري"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
                    <textarea
                      value={form.description}
                      onChange={handleChange("description")}
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                      placeholder="Short note about this promotion…"
                    />
                  </div>

                  {/* Dates */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Start Date<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={handleChange("startDate")}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      End Date<span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={handleChange("endDate")}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                    />
                  </div>

                  {/* Times */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Start Time</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={handleChange("startTime")}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">End Time</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={handleChange("endTime")}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                    />
                  </div>

                  {/* Days */}
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Applies On Days<span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_WEEKDAYS.map((day) => {
                        const selected = form.days.includes(day);
                        const label =
                          day === "SUN"
                            ? "Sun"
                            : day === "MON"
                            ? "Mon"
                            : day === "TUE"
                            ? "Tue"
                            : day === "WED"
                            ? "Wed"
                            : day === "THU"
                            ? "Thu"
                            : day === "FRI"
                            ? "Fri"
                            : "Sat";
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-200 bg-gray-50 text-gray-700"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Order types */}
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Applies On Order Types<span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ORDER_TYPE_OPTIONS.map((opt) => {
                        const selected = form.orderTypes.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleOrderType(opt.value)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-200 bg-gray-50 text-gray-700"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Priority & include modifiers */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Priority</label>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={handleChange("priority")}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                      placeholder="e.g. 10"
                    />
                  </div>
                  <div className="mt-6 flex items-center gap-2">
                    <input
                      id="include-modifiers"
                      type="checkbox"
                      checked={form.includeModifiers}
                      onChange={handleChange("includeModifiers")}
                      className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                    />
                    <label htmlFor="include-modifiers" className="text-xs font-medium text-gray-700">
                      Include Modifiers
                    </label>
                  </div>
                </div>
              </section>

              {/* Applies On Branches */}
              <section className="rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-800">Applies On Branches</h2>
                  <button
                    type="button"
                    onClick={async () => {
                      await loadBranchesOnce();
                      setBranchModalOpen(true);
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Add Branches
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedBranchOptions.length === 0 && (
                    <span className="text-xs text-gray-400">No branches selected.</span>
                  )}
                  {selectedBranchOptions.map((b) => (
                    <span
                      key={b.id}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800"
                    >
                      {b.name}
                      <button
                        type="button"
                        onClick={() => toggleBranch(b.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {form.branches.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={clearBranches}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </section>

              {/* Status */}
              <section className="rounded-xl border bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-800">Status</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Status</label>
                    <select
                      value={form.status}
                      onChange={handleChange("status")}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="EXPIRED">Expired</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>

                  <div className="mt-6 flex items-center gap-2">
                    <input
                      id="active-toggle"
                      type="checkbox"
                      checked={form.active}
                      onChange={handleChange("active")}
                      className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                    />
                    <label htmlFor="active-toggle" className="text-xs font-medium text-gray-700">
                      Promotion is active
                    </label>
                  </div>
                </div>
              </section>

              {/* Promotion Details */}
              <section className="rounded-xl border bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-800">Promotion Details</h2>

                {/* Promotion Type */}
                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium text-gray-700">Promotion Type</label>
                  <div className="flex gap-6 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="promotionType"
                        value="BASIC"
                        checked={form.promotionType === "BASIC"}
                        onChange={() => setPromotionType("BASIC")}
                      />
                      <span>Basic</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="promotionType"
                        value="ADVANCED"
                        checked={form.promotionType === "ADVANCED"}
                        onChange={() => setPromotionType("ADVANCED")}
                      />
                      <span>Advanced</span>
                    </label>
                  </div>
                </div>

                {/* BASIC config */}
                {form.promotionType === "BASIC" && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Discount Type
                      </label>
                      <select
                        value={form.discountType}
                        onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                      >
                        <option value="VALUE">Value</option>
                        <option value="PERCENT">Percent</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Discount Amount
                      </label>
                      <input
                        type="number"
                        value={form.discountAmount}
                        onChange={handleChange("discountAmount")}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                        placeholder="e.g. 8"
                      />
                    </div>

                    {/* Product size selector */}
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Product Sizes
                      </label>

                      <div className="mb-2 flex flex-wrap gap-2">
                        {selectedSizeOptions.length === 0 && (
                          <span className="text-xs text-gray-400">No product sizes selected.</span>
                        )}
                        {selectedSizeOptions.map((opt) => (
                          <span
                            key={opt.id}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700"
                          >
                            {opt.label}
                            <button
                              type="button"
                              onClick={() => toggleProductSize(opt.id)}
                              className="text-blue-500 hover:text-blue-700"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await loadProductSizesOnce();
                            setSizeModalOpen(true);
                          }}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Select product sizes
                        </button>

                        {form.products.length > 0 && (
                          <button
                            type="button"
                            onClick={clearProductSizes}
                            className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ADVANCED config */}
                {form.promotionType === "ADVANCED" && (
                  <div className="mt-5 grid gap-6 md:grid-cols-2">
                    {/* When customer */}
                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-700">When customer</p>
                      <div className="space-y-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="conditionKind"
                            value="BUYS_QUANTITY"
                            checked={form.conditionKind === "BUYS_QUANTITY"}
                            onChange={() => setConditionKind("BUYS_QUANTITY")}
                          />
                          <span>Buys Quantity</span>
                        </label>

                        {form.conditionKind === "BUYS_QUANTITY" && (
                          <div className="pl-6">
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Quantity
                            </label>
                            <input
                              type="number"
                              value={form.conditionQty}
                              onChange={handleChange("conditionQty")}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                            />
                          </div>
                        )}

                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="conditionKind"
                            value="SPENDS_AMOUNT"
                            checked={form.conditionKind === "SPENDS_AMOUNT"}
                            onChange={() => setConditionKind("SPENDS_AMOUNT")}
                          />
                          <span>Spends</span>
                        </label>

                        {form.conditionKind === "SPENDS_AMOUNT" && (
                          <div className="pl-6">
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Amount
                            </label>
                            <input
                              type="number"
                              value={form.conditionSpend}
                              onChange={handleChange("conditionSpend")}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                            />
                          </div>
                        )}

                        <div className="mt-3">
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            Products
                          </label>
                          <div className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400">
                            TODO: connect to product selector (buying side).
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* They will */}
                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-700">They will</p>
                      <div className="space-y-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="rewardKind"
                            value="DISCOUNT_ON_ORDER"
                            checked={form.rewardKind === "DISCOUNT_ON_ORDER"}
                            onChange={() => setRewardKind("DISCOUNT_ON_ORDER")}
                          />
                          <span>Get discount on order</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="rewardKind"
                            value="DISCOUNT_ON_PRODUCT"
                            checked={form.rewardKind === "DISCOUNT_ON_PRODUCT"}
                            onChange={() => setRewardKind("DISCOUNT_ON_PRODUCT")}
                          />
                          <span>Get discount on product</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="rewardKind"
                            value="PAY_FIXED_AMOUNT"
                            checked={form.rewardKind === "PAY_FIXED_AMOUNT"}
                            onChange={() => setRewardKind("PAY_FIXED_AMOUNT")}
                          />
                          <span>Pay fixed amount</span>
                        </label>

                        {(form.rewardKind === "DISCOUNT_ON_ORDER" ||
                          form.rewardKind === "DISCOUNT_ON_PRODUCT") && (
                          <div className="space-y-3 pl-6">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">
                                Discount Type
                              </label>
                              <select
                                value={form.rewardDiscountType}
                                onChange={(e) => setRewardDiscountType(e.target.value as DiscountType)}
                                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                              >
                                <option value="VALUE">Value</option>
                                <option value="PERCENT">Percent</option>
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-700">
                                Discount Amount
                              </label>
                              <input
                                type="number"
                                value={form.rewardDiscountValue}
                                onChange={handleChange("rewardDiscountValue")}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                              />
                            </div>
                          </div>
                        )}

                        {form.rewardKind === "DISCOUNT_ON_PRODUCT" && (
                          <div className="mt-3 pl-6">
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Products (discounted)
                            </label>

                            <div className="mb-2 flex flex-wrap gap-2">
                              {selectedSizeOptions.length === 0 && (
                                <span className="text-xs text-gray-400">
                                  No product sizes selected.
                                </span>
                              )}
                              {selectedSizeOptions.map((opt) => (
                                <span
                                  key={opt.id}
                                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700"
                                >
                                  {opt.label}
                                  <button
                                    type="button"
                                    onClick={() => toggleProductSize(opt.id)}
                                    className="text-blue-500 hover:text-blue-700"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  await loadProductSizesOnce();
                                  setSizeModalOpen(true);
                                }}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Select product sizes
                              </button>

                              {form.products.length > 0 && (
                                <button
                                  type="button"
                                  onClick={clearProductSizes}
                                  className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {form.rewardKind === "PAY_FIXED_AMOUNT" && (
                          <div className="pl-6">
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Fixed Amount
                            </label>
                            <input
                              type="number"
                              value={form.rewardFixedAmount}
                              onChange={handleChange("rewardFixedAmount")}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </form>
          )}
        </div>

        {/* Pinned footer with actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
          <div className="text-xs text-gray-500">
            {isNew ? "Creating new promotion" : `Editing promotion #${id}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-70"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isNew ? "Create Promotion" : "Save Promotion"}
            </button>
          </div>
        </div>
      </div>

      {/* Product size selection modal */}
      {sizeModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Select product sizes</h2>
              <button
                type="button"
                onClick={() => setSizeModalOpen(false)}
                className="rounded-full p-1 hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={sizeSearch}
                onChange={(e) => setSizeSearch(e.target.value)}
                placeholder="Search product size…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
              />
            </div>

            <div className="flex-1 overflow-auto rounded-lg border border-gray-100">
              {sizeLoading && (
                <div className="flex items-center justify-center py-8 text-xs text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading product sizes…
                </div>
              )}

              {!sizeLoading && filteredSizeOptions.length === 0 && (
                <div className="py-8 text-center text-xs text-gray-400">
                  No product sizes found.
                </div>
              )}

              {!sizeLoading && filteredSizeOptions.length > 0 && (
                <ul className="divide-y divide-gray-100 text-sm">
                  {filteredSizeOptions.map((opt) => {
                    const checked = form.products.includes(opt.id);
                    return (
                      <li
                        key={opt.id}
                        className="cursor-pointer px-3 py-2 hover:bg-gray-50"
                        onClick={() => toggleProductSize(opt.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-800">{opt.label}</span>
                          <input
                            type="checkbox"
                            readOnly
                            checked={checked}
                            className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <div className="text-gray-500">{form.products.length} size(s) selected</div>
              <button
                type="button"
                onClick={() => setSizeModalOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch selection modal */}
      {branchModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Select branches</h2>
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="rounded-full p-1 hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                placeholder="Search branch…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black"
              />
            </div>

            <div className="flex-1 overflow-auto rounded-lg border border-gray-100">
              {branchLoading && (
                <div className="flex items-center justify-center py-8 text-xs text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading branches…
                </div>
              )}

              {!branchLoading && filteredBranchOptions.length === 0 && (
                <div className="py-8 text-center text-xs text-gray-400">No branches found.</div>
              )}

              {!branchLoading && filteredBranchOptions.length > 0 && (
                <ul className="divide-y divide-gray-100 text-sm">
                  {filteredBranchOptions.map((b) => {
                    const checked = form.branches.includes(b.id);
                    return (
                      <li
                        key={b.id}
                        className="cursor-pointer px-3 py-2 hover:bg-gray-50"
                        onClick={() => toggleBranch(b.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-800">{b.name}</span>
                          <input
                            type="checkbox"
                            readOnly
                            checked={checked}
                            className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <div className="text-gray-500">{form.branches.length} branch(es) selected</div>
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
