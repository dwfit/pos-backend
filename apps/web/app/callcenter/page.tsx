"use client";

import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, X, Send } from "lucide-react";
import { authStore } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

/* ----------------------------- Types ----------------------------- */
type Category = { id: string; name: string; sort: number; isActive: boolean };
type ProductSize = { id: string; name: string; code?: string | null; price: number };
type Product = {
  id: string;
  name: string;
  categoryId: string;
  basePrice: number;
  taxRate: number; // 0.15 or 15
  isActive: boolean;
  sizes: ProductSize[];
  productModifiers?: { modifierId: string }[];
  imageUrl?: string | null;
};

type ModifierItem = { id: string; name: string; price: number };
type ModifierGroup = { id: string; name: string; min: number; max: number; items: ModifierItem[] };

type CartItem = {
  productId: string;
  productName: string;
  size?: { id: string; name: string; code?: string | null; price: number } | null;
  qty: number;
  modifiers: { id: string; name: string; price: number }[];
  unitPrice: number; // VAT-inclusive (size/base + modifiers)
};

type Device = {
  id: string;
  name: string;
  receivesOnlineOrders: boolean;
  isActive?: boolean;
  status?: "USED" | "NOT_USED";
  type?: string;
  branch?: {
    id: string;
    name?: string | null;
    brandId?: string | null; 
    brand?: { id: string; name?: string | null } | null;
  } | null;
};


type Brand = { id: string; name: string; isActive?: boolean };
type Branch = {
  id: string;
  name?: string | null;
  brandId?: string | null;
  brand?: { id: string; name?: string | null } | null;
  isActive?: boolean;
};

/* --------------------------- Helpers ----------------------------- */
function getToken() {
  if (typeof window === "undefined") return "";

  // 1) Primary: what authStore is currently holding
  const storeToken = authStore.getState().token || authStore.getState().posToken || "";

  // 2) Fallbacks: direct localStorage keys, in case something wrote them there
  const lsToken =
    localStorage.getItem("token") ||
    localStorage.getItem("pos_token") ||
    localStorage.getItem("accessToken") || // extra safety
    "";

  return storeToken || lsToken;
}

async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const token = getToken();

  // 🔍 temporary debug – REMOVE when it’s working
  console.log("🔐 Callcenter fetch:", input, "token prefix:", token?.slice(0, 16));

  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: "include",
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
  }
  return res.json();
}

/** Try multiple paths, accept array | {items} | {data} */
async function fetchListAnyShape<T>(paths: string[], signal?: AbortSignal): Promise<T[]> {
  let lastErr: any = null;
  for (const p of paths) {
    try {
      const json = await fetchJson<any>(p, {}, signal);
      if (Array.isArray(json)) return json as T[];
      if (Array.isArray(json?.items)) return json.items as T[];
      if (Array.isArray(json?.data)) return json.data as T[];
      const maybeArr = json?.items?.items || json?.result || json?.rows || json?.list || null;
      if (Array.isArray(maybeArr)) return maybeArr as T[];
      throw new Error("Unexpected response shape");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("All paths failed");
}

/* ===== VAT helpers ===== */
function rateToDecimal(r?: number) {
  if (r == null || !isFinite(Number(r))) return 0;
  const n = Number(r);
  return n < 1 ? n : n / 100;
}
function percentStr(r?: number) {
  const v = rateToDecimal(r) * 100;
  const s = (Math.round(v * 100) / 100).toString();
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}
function fmtSAR(n: number) {
  return new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR" }).format(n);
}
function splitInclusive(amount: number, rateDec: number) {
  const net = amount / (1 + rateDec);
  const vat = amount - net;
  return { net, vat, gross: amount };
}

/* ✅ Today helper (YYYY-MM-DD for input[type=date]) */
function todayYYYYMMDD() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* ============================== UI =============================== */

export default function CallCenter() {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({
    Closed: 0,
    Pending: 0,
    Active: 0,
    Declined: 0,
  });

  const [cats, setCats] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [mods, setMods] = useState<ModifierGroup[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  const [sizePick, setSizePick] = useState<Record<string, string>>({});
  const [modPicker, setModPicker] = useState<{ product: Product; open: boolean } | null>(null);
  const [pickedMods, setPickedMods] = useState<Record<string, Set<string>>>({});

  // Filters
  const [branchId, setBranchId] = useState("");

  // ✅ FIX: date default is set at initial render (so KPI loads correctly without clicking)
  const [date, setDate] = useState(() => todayYYYYMMDD());

  // ✅ Drawer Brand filter
  const [brands, setBrands] = useState<Brand[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [brandId, setBrandId] = useState("");

  // ---- VAT calc per line/cart ----
  function calcLine(l: CartItem) {
    const product = products.find((p) => p.id === l.productId);
    const r = rateToDecimal(product?.taxRate ?? 0);
    const unit = splitInclusive(l.unitPrice, r);
    const total = { net: unit.net * l.qty, vat: unit.vat * l.qty, gross: unit.gross * l.qty };
    return { unit, total, rate: product?.taxRate ?? 0 };
  }
  function calcCartTotals() {
    let net = 0,
      vat = 0,
      gross = 0;
    for (const line of cart) {
      const { total } = calcLine(line);
      net += total.net;
      vat += total.vat;
      gross += total.gross;
    }
    return { net, vat, gross };
  }

  /* ------------------ Load categories/products/mods ------------------ */
useEffect(() => {
  // 🧠 If no brand selected yet -> clear menu & don't call API
  if (!brandId) {
    setCats([]);
    setProducts([]);
    setMods([]);
    setActiveCat(null);
    return;
  }

  const ac = new AbortController();

  (async () => {
    try {
      const qs = `?brandId=${encodeURIComponent(brandId)}`;

      const [cData, pData, mData] = await Promise.all([
        fetchListAnyShape<Category>([`/api/menu/categories${qs}`], ac.signal),
        fetchListAnyShape<Product>([`/api/menu/products${qs}`], ac.signal),
        fetchListAnyShape<ModifierGroup>([`/api/menu/modifiers${qs}`], ac.signal),
      ]);

      const activeCats = (cData || [])
        .map((c) => ({ ...c, sort: Number.isFinite((c as any).sort) ? (c as any).sort : 0 }))
        .filter((c) => c.isActive)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

      setCats(activeCats);
      setActiveCat(activeCats[0]?.id ?? null);

      setProducts((pData || []).filter((p) => p.isActive));
      setMods(mData || []);
    } catch (err: any) {
      // Ignore abort noise from Strict Mode / unmounts
      if (err?.name === "AbortError" || String(err?.message || "").includes("aborted")) return;

      console.error("Menu load failed:", err);
      setCats([]);
      setProducts([]);
      setMods([]);
    }
  })();

  return () => ac.abort();
}, [brandId]);

  /* ------------------ Load Brands + Branches ------------------ */
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const [bData, brData] = await Promise.all([
          fetchListAnyShape<Brand>(["/api/brands"], ac.signal),
          fetchListAnyShape<Branch>(["/api/branches"], ac.signal),
        ]);

        setBrands((bData || []).filter((b) => (b.isActive ?? true)));
        setBranches((brData || []).filter((b) => (b.isActive ?? true)));
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (msg.includes("AbortError") || msg.includes("signal is aborted")) return;
        if (msg.startsWith("404")) return;
        console.error("Brands/Branches load failed:", e);
      }
    })();
    return () => ac.abort();
  }, []);

  /* ------------------ Load devices (cashiers) ------------------ */
  useEffect(() => {
    let cancelled = false;
  
    (async () => {
      setDevicesLoading(true);
      setDevicesError(null);
  
      try {
        // ✅ try API_BASE first, then relative
        let json: any;
        try {
          json = await fetchJson<any>(`${API_BASE}/api/devices/online`);
        } catch {
          json = await fetchJson<any>(`/api/devices/online`);
        }
  
        if (cancelled) return;
  
        if (Array.isArray(json?.devices)) {
          setDevices(json.devices);
          if (Array.isArray(json.brands)) setBrands(json.brands);
        } else if (Array.isArray(json)) {
          setDevices(json);
        } else if (Array.isArray(json?.items)) {
          setDevices(json.items);
        } else {
          throw new Error("Unexpected devices response shape");
        }
      } catch (e: any) {
        // ✅ ignore abort errors (dev/strict-mode)
        if (e?.name === "AbortError" || String(e?.message || "").includes("aborted")) return;
  
        if (!cancelled) {
          setDevicesError(String(e?.message || "Failed to load devices"));
          setDevices([]);
        }
      } finally {
        if (!cancelled) setDevicesLoading(false);
      }
    })();
  
    return () => {
      cancelled = true;
    };
  }, []);
  

  /* --------- Branch options derived from devices (unique) --------- */
  const branchOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of devices) {
      const id = d.branch?.id;
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, d.branch?.name || "Branch " + id.slice(-4));
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [devices]);

  /* --------- Map branchId -> brandId --------- */
  const branchToBrandId = useMemo(() => {
    const m = new Map<string, string>();
    for (const br of branches) {
      const bId = br.brandId || br.brand?.id || "";
      if (br?.id && bId) m.set(br.id, bId);
    }
    // fallback from devices (if branches endpoint missing)
    for (const d of devices) {
      const brId = d.branch?.id;
      const bId = d.branch?.brandId || d.branch?.brand?.id;
      if (brId && bId && !m.has(brId)) m.set(brId, bId);
    }
    return m;
  }, [branches, devices]);

  /* --------- Brand options for drawer --------- */
  const drawerBrandOptions = useMemo(() => {
    // collect brands that appear via devices->branch->brand
    const brandSet = new Set<string>();
    for (const d of devices) {
      const brId = d.branch?.id;
      if (!brId) continue;
      const bId = branchToBrandId.get(brId);
      if (bId) brandSet.add(bId);
    }

    // Prefer real brands list
    const fromBrands = (brands || [])
      .filter((b) => (b.isActive ?? true))
      .filter((b) => brandSet.size === 0 || brandSet.has(b.id))
      .map((b) => ({ id: b.id, name: b.name }));

    if (fromBrands.length) return fromBrands;

    // Fallback: derive from devices -> branch.brand
    const fallback = new Map<string, string>();
    for (const d of devices) {
      const bId = d.branch?.brandId || d.branch?.brand?.id;
      if (!bId) continue;
      const bName = d.branch?.brand?.name || `Brand ${bId.slice(-4)}`;
      fallback.set(bId, bName);
    }
    return Array.from(fallback.entries()).map(([id, name]) => ({ id, name }));
  }, [brands, devices, branchToBrandId]);

  /* ---------- KPI loader (uses filters) ---------- */
  const loadKPI = async () => {
    try {
      const params = new URLSearchParams();
      params.set("channel", "CALLCENTER");

      if (branchId) params.set("branchId", branchId);

      if (date) {
        params.set("date", date);
        params.set("dateFrom", date);
        params.set("dateTo", date);
      }

      const data = await fetchJson<any>(`${API_BASE}/orders?${params.toString()}`);

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : null;

      if (!rows) return;

      const base = { Closed: 0, Pending: 0, Active: 0, Declined: 0 };

      for (const r of rows) {
        const stRaw = r.status ?? r.state ?? r.orderStatus ?? r.callcenterStatus ?? r.Status ?? "";
        const st = String(stRaw).toUpperCase();

        if (st === "PENDING" || st === "NEW" || st === "SUBMITTED") base.Pending += 1;
        else if (st === "ACTIVE" || st === "IN_PROGRESS") base.Active += 1;
        else if (st === "DECLINED" || st === "REJECTED" || st === "CANCELLED") base.Declined += 1;
        else if (st === "CLOSED" || st === "DONE" || st === "FINISHED") base.Closed += 1;
      }

      setCounts(base);
    } catch (err) {
      console.error("Callcenter KPI load error:", err);
    }
  };

  /* ✅ Initial KPI load */
  useEffect(() => {
    loadKPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- SSE status counters ---------------- */
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      const url = `${API_BASE}/api/callcenter/stream`;
      es = new EventSource(url, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === "status") {
            const status = String(data.status) as "pending" | "active" | "done" | "declined";
            setCounts((prev) => {
              const next = { ...prev };
              if (status === "active") {
                next.Pending = Math.max(0, next.Pending - 1);
                next.Active += 1;
              }
              if (status === "done") {
                next.Active = Math.max(0, next.Active - 1);
                next.Closed += 1;
              }
              if (status === "declined") {
                next.Pending = Math.max(0, next.Pending - 1);
                next.Active = Math.max(0, next.Active - 1);
                next.Declined += 1;
              }
              return next;
            });
          }
        } catch {
          // ignore
        }
      };
      es.onerror = () => {};
    } catch {}
    return () => {
      es?.close?.();
    };
  }, []);

  // Filter products by active category
  const visibleProducts = useMemo(
    () => products.filter((p) => (activeCat ? p.categoryId === activeCat : true)),
    [products, activeCat]
  );

  // Helpers
  function productSize(p: Product): ProductSize | null {
    const sId = sizePick[p.id];
    if (!sId) return p.sizes?.[0] || null;
    return p.sizes.find((s) => s.id === sId) || null;
  }
  function srcOrFallback(url?: string | null) {
    if (!url || !url.trim()) return "/images/placeholder-product.png";
    return url;
  }
  function sameModifiers(a: { id: string }[] = [], b: { id: string }[] = []) {
    if (a.length !== b.length) return false;
    const as = a.map((x) => x.id).sort();
    const bs = b.map((x) => x.id).sort();
    for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
    return true;
  }
  function isSameLine(
    line: CartItem,
    candidate: { productId: string; sizeId?: string | null; modifiers: { id: string }[] }
  ) {
    const aSize = line.size?.id ?? null;
    const bSize = candidate.sizeId ?? null;
    return line.productId === candidate.productId && aSize === bSize && sameModifiers(line.modifiers, candidate.modifiers);
  }

  function groupsForProduct(p: Product): ModifierGroup[] {
    if (!p.productModifiers?.length) return [];
    const set = new Set(p.productModifiers.map((pm) => pm.modifierId));
    return mods.filter((g) => set.has(g.id));
  }

  function openModifiersFor(p: Product) {
    const groups = groupsForProduct(p);

    if (!groups.length) {
      const size = productSize(p);
      const unitPrice = size ? Number(size.price) : Number(p.basePrice || 0);

      setCart((curr) => {
        const candidate = { productId: p.id, sizeId: size?.id ?? null, modifiers: [] as { id: string }[] };
        const idx = curr.findIndex((line) => isSameLine(line, candidate));
        if (idx >= 0) {
          const next = [...curr];
          next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
          return next;
        }
        return [
          ...curr,
          {
            productId: p.id,
            productName: p.name,
            size: size ? { id: size.id, name: size.name, code: size.code ?? undefined, price: Number(size.price) } : null,
            qty: 1,
            modifiers: [],
            unitPrice,
          },
        ];
      });
      return;
    }

    const init: Record<string, Set<string>> = {};
    for (const g of groups) init[g.id] = new Set();
    setPickedMods(init);
    setModPicker({ product: p, open: true });
  }

  function toggleItem(groupId: string, itemId: string, max: number) {
    setPickedMods((prev) => {
      const next = { ...prev };
      const set = new Set(next[groupId] || []);
      if (set.has(itemId)) {
        set.delete(itemId);
      } else {
        if (max > 0 && set.size >= max) {
          const v = Array.from(set.values());
          if (v.length) set.delete(v[0]);
        }
        set.add(itemId);
      }
      next[groupId] = set;
      return next;
    });
  }

  function addToCartWithMods() {
    if (!modPicker) return;
    const p = modPicker.product;
    const size = productSize(p);

    const groups = groupsForProduct(p);
    for (const g of groups) {
      const picked = pickedMods[g.id] || new Set();
      if (picked.size < (g.min || 0)) {
        alert(`Please select at least ${g.min} item(s) for "${g.name}".`);
        return;
      }
    }

    const sel = groups.flatMap((g) => {
      const picked = pickedMods[g.id] || new Set<string>();
      return g.items.filter((it) => picked.has(it.id)).map((it) => ({ id: it.id, name: it.name, price: it.price }));
    });

    const modTotal = sel.reduce((s, m) => s + Number(m.price || 0), 0);
    const base = size ? Number(size.price) : Number(p.basePrice || 0);
    const unitPrice = base + modTotal;

    const candidate = { productId: p.id, sizeId: size?.id ?? null, modifiers: sel };

    setCart((curr) => {
      const idx = curr.findIndex((line) => isSameLine(line, candidate));
      if (idx >= 0) {
        const next = [...curr];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...curr,
        {
          productId: p.id,
          productName: p.name,
          size: size ? { id: size.id, name: size.name, code: size.code ?? undefined, price: Number(size.price) } : null,
          qty: 1,
          modifiers: sel,
          unitPrice,
        },
      ];
    });

    setModPicker(null);
  }

  function removeCartItem(idx: number) {
    setCart((c) => c.filter((_, i) => i !== idx));
  }
  function setQty(idx: number, qty: number) {
    setCart((c) => c.map((it, i) => (i === idx ? { ...it, qty: Math.max(1, qty || 1) } : it)));
  }

  const totals = useMemo(() => calcCartTotals(), [cart, products]);

  /* ✅ Devices filtered by brand */
  const cashierDevices = useMemo(() => {
    if (!brandId) return []; // brand REQUIRED
  
    return devices.filter((d) => {
      const devBrandId = d.branch?.brand?.id || d.branch?.brandId || "";
      return (
        d.type?.toUpperCase() === "CASHIER" &&
        (d.receivesOnlineOrders ?? true) &&
        (d.isActive ?? true) &&
        d.status !== "NOT_USED" &&
        devBrandId === brandId
      );
    });
  }, [devices, brandId]);
  
  useEffect(() => {
    if (!deviceId) return;
    const stillValid = cashierDevices.some((d) => d.id === deviceId);
    if (!stillValid) setDeviceId("");
  }, [brandId, cashierDevices, deviceId]);

  async function sendToDevice() {
    if (!deviceId) return alert("Select a device.");
    if (cart.length === 0) return alert("Add at least one item.");

    const picked = devices.find((d) => d.id === deviceId);
    if (!picked || picked.type?.toUpperCase?.() !== "CASHIER" || picked.receivesOnlineOrders === false) {
      return alert("Please choose a CASHIER device that can receive online orders.");
    }

    setSending(true);
    try {
      const payload = {
        deviceId,
        branchId: picked.branch?.id,
        brandId,
        customerName: customerName || undefined,
        customerMobile: customerMobile || undefined,
        notes: notes || undefined,
        items: cart.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          size: i.size ? { id: i.size.id, name: i.size.name, code: i.size.code } : undefined,
          modifiers: i.modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
        })),
        channel: "CALLCENTER",
      };

      await fetchJson("/api/callcenter/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setCounts((c) => ({ ...c, Pending: c.Pending + 1 }));
      setOpen(false);
      setCart([]);
      setCustomerName("");
      setCustomerMobile("");
      setNotes("");
      setDeviceId("");
      setBrandId("");
    } catch (e: any) {
      alert(e?.message || "Failed to send order");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold"></h2>

      {/* Filters + New order button */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Branch filter */}
        <div className="grid gap-1 text-sm">
          <label className="text-slate-600">Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border rounded-xl px-3 py-2 text-sm w-44">
            <option value="">All Branches</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date filter */}
        <div className="grid gap-1 text-sm">
          <label className="text-slate-600">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-xl px-3 py-2 text-sm" />
        </div>

        <button onClick={loadKPI} className="px-4 py-2 bg-black text-white rounded-xl text-sm">
          Apply Filters
        </button>

        <button className="ml-auto rounded-xl bg-black text-white px-4 py-2 inline-flex items-center gap-2" onClick={() => setOpen(true)}>
          <ShoppingCart className="w-4 h-4" />
          New Call Center Order
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["Closed", "Pending", "Active", "Declined"] as const).map((s) => (
          <div key={s} className="rounded-2xl bg-white p-4 shadow-sm border">
            <div className="text-sm text-slate-500">{s}</div>
            <div className="text-2xl font-semibold">
              {s === "Closed" ? counts.Closed : s === "Pending" ? counts.Pending : s === "Active" ? counts.Active : counts.Declined}
            </div>
          </div>
        ))}
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 w-full h-[100dvh] bg-white shadow-2xl overflow-y-auto overscroll-contain">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b p-4 bg-white/90">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <h3 className="font-semibold">New POS Order</h3>
                <span className="text-xs inline-flex items-center rounded-full border px-2 py-0.5 text-slate-600 bg-white">draft</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 flex-1 min-h-0 overflow-auto">
              {/* LEFT */}
              <section className="lg:col-span-2">
                <div className="flex flex-wrap gap-2 mb-3">
                  {cats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCat(c.id)}
                      className={`px-3 py-1.5 rounded-full border text-sm ${activeCat === c.id ? "bg-black text-white border-black" : "hover:bg-slate-50"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {visibleProducts.map((p) => {
                    const s = productSize(p);
                    return (
                      <div key={p.id} className="border rounded-2xl p-3">
                        <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 bg-slate-50">
                          <img
                            src={srcOrFallback(p.imageUrl)}
                            alt={p.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/images/placeholder-product.png";
                            }}
                          />
                        </div>
                        <div className="font-medium leading-tight">{p.name}</div>

                        {p.sizes?.length ? (
                          <select
                            className="mt-2 w-full border rounded-xl px-2 py-2 text-sm"
                            value={s?.id ?? ""}
                            onChange={(e) => setSizePick((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          >
                            {p.sizes.map((sz) => (
                              <option key={sz.id} value={sz.id}>
                                {sz.name} — SAR {Number(sz.price).toFixed(2)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-sm text-slate-600 mt-2">SAR {Number(p.basePrice).toFixed(2)}</div>
                        )}

                        <button onClick={() => openModifiersFor(p)} className="mt-3 w-full rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
                          Add
                        </button>
                      </div>
                    );
                  })}

                  {visibleProducts.length === 0 && <div className="col-span-full text-sm text-slate-500">No products in this category.</div>}
                </div>
              </section>

              {/* RIGHT */}
              <aside className="lg:col-span-1 space-y-4">
                <div className="border rounded-2xl p-4">
                  <h5 className="font-medium mb-3">Cart</h5>
                  <div className="space-y-3 max-h-64 overflow-auto pr-1">
                    {cart.length === 0 && <div className="text-sm text-slate-500">No items yet.</div>}
                    {cart.map((i, idx) => {
                      const product = products.find((p) => p.id === i.productId);
                      const rate = product?.taxRate ?? 0;
                      const { total } = calcLine(i);

                      return (
                        <div key={idx} className="grid gap-1">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {i.productName}
                              {i.size ? ` — ${i.size.name}` : ""}
                              <span className="ml-1 inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                                VAT {percentStr(rate)}%
                              </span>
                            </div>
                            <button className="text-slate-400 hover:text-rose-600" onClick={() => removeCartItem(idx)}>
                              ×
                            </button>
                          </div>

                          {!!i.modifiers.length && <div className="text-xs text-slate-600">{i.modifiers.map((m) => m.name).join(", ")}</div>}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="h-7 w-7 inline-flex items-center justify-center rounded-lg border text-sm hover:bg-slate-50"
                                onClick={() => setQty(idx, Math.max(1, i.qty - 1))}
                              >
                                –
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={i.qty}
                                onChange={(e) => setQty(idx, Number(e.target.value) || 1)}
                                className="w-16 border rounded-lg px-2 py-1 text-sm text-center"
                              />
                              <button
                                type="button"
                                className="h-7 w-7 inline-flex items-center justify-center rounded-lg border text-sm hover:bg-slate-50"
                                onClick={() => setQty(idx, i.qty + 1)}
                              >
                                +
                              </button>
                            </div>
                            <div className="text-sm font-medium">{fmtSAR(total.gross)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 space-y-1 text-sm">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Subtotal (ex-VAT)</span>
                      <span className="font-medium">{fmtSAR(totals.net)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>VAT</span>
                      <span className="font-medium">{fmtSAR(totals.vat)}</span>
                    </div>
                    <div className="flex items-center justify-between text-base font-semibold pt-1">
                      <span>Total</span>
                      <span>{fmtSAR(totals.gross)}</span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-2xl p-4 grid gap-3">
                  <h5 className="font-medium">Customer</h5>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-600">Name</span>
                    <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="border rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-600">Mobile</span>
                    <input
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      className="border rounded-xl px-3 py-2 text-sm"
                      placeholder="05xxxxxxxx"
                    />
                  </label>
                </div>

                {/* ✅ Brand (REQUIRED) */}
                <div className="border rounded-2xl p-4 grid gap-3">
                  <h5 className="font-medium">Brand</h5>

                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-600">
                      Brand Name <span className="text-rose-600">*</span>
                    </span>

                    <select
                      value={brandId}
                      onChange={(e) => setBrandId(e.target.value)}
                      className="border rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="" disabled>
                        Select brand…
                      </option>

                      {drawerBrandOptions.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="border rounded-2xl p-4 grid gap-3">
                  <h5 className="font-medium">Send To</h5>

                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-600">
                      Device <span className="text-rose-600">*</span>
                    </span>

                    {!brandId ? (
                      <div className="text-xs text-slate-500 px-2 py-2 border rounded-xl bg-slate-50">
                        Please select a brand first
                      </div>
                    ) : devicesLoading ? (
                      <div className="text-xs text-slate-500 px-1 py-2">Loading devices…</div>
                    ) : devicesError ? (
                      <div className="text-xs text-rose-600 px-1 py-2">{devicesError}</div>
                    ) : (
                      <select
                        value={deviceId}
                        onChange={(e) => setDeviceId(e.target.value)}
                        className="border rounded-xl px-3 py-2 text-sm"
                      >
                        <option value="" disabled>
                          Select cashier…
                        </option>

                        {cashierDevices.length === 0 ? (
                          <option value="" disabled>
                            No cashier devices for this brand
                          </option>
                        ) : (
                          cashierDevices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                              {d.branch?.name ? ` — ${d.branch.name}` : ""}
                            </option>
                          ))
                        )}
                      </select>
                    )}
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-600">Notes</span>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="border rounded-xl px-3 py-2 text-sm" />
                  </label>
                </div>

                <button
                  onClick={sendToDevice}
                  disabled={sending || !brandId || !deviceId}
                  className="w-full rounded-xl bg-black text-white px-4 py-2 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {sending ? "Sending…" : "Send to Device"}
                </button>
              </aside>
            </div>
          </div>
        </div>
      )}

      {/* Modifiers dialog */}
      {modPicker?.open && modPicker.product && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModPicker(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4 bg-white/90">
              <div>
                <div className="font-semibold">Choose Modifiers</div>
                <div className="text-xs text-slate-600">{modPicker.product.name}</div>
              </div>
              <button className="p-2 rounded-xl hover:bg-slate-100" onClick={() => setModPicker(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-auto h-[calc(100%-60px)]">
              {(() => {
                const groups = groupsForProduct(modPicker.product);
                if (!groups.length) return <div className="text-sm text-slate-600">No modifiers for this product.</div>;

                return groups.map((g) => {
                  const picked = pickedMods[g.id] || new Set<string>();
                  return (
                    <div key={g.id} className="border rounded-2xl p-3">
                      <div className="font-medium">{g.name}</div>
                      <div className="text-xs text-slate-500 mb-2">
                        Min {g.min} • Max {g.max || "∞"}
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {g.items.map((it) => {
                          const checked = picked.has(it.id);
                          return (
                            <label key={it.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={checked} onChange={() => toggleItem(g.id, it.id, g.max)} />
                              <span className="flex-1">{it.name}</span>
                              <span className="text-slate-600">SAR {Number(it.price).toFixed(2)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}

              <div className="flex justify-end">
                <button className="rounded-xl bg-black text-white px-4 py-2" onClick={addToCartWithMods}>
                  Add to cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
