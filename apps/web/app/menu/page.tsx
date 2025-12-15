"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Tabs } from "@/components/Tabs";
import { Spinner } from "@/components/Spinner";
import { ToastStack, useToast } from "@/components/Toast";

/* ============================= Types ============================= */

type Category = {
  id: string;
  name: string;
  imageUrl?: string | null;
  sort?: number;
  isActive?: boolean;
};

type Size = { id?: string; name: string; price: number; code?: string | null };

type Tax = { id: number; name: string; rate: number; isActive?: boolean };

type Product = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  imageUrl?: string | null;
  basePrice?: number;
  taxRate?: number;
  taxId?: number | null;
  tax?: Tax | null;
  isActive?: boolean;
  sizes: Size[];
};

type ModifierItem = {
  id: string;
  name: string;
  price: number;
  isActive?: boolean;
  taxId?: number | null;
  tax?: Tax | null;
};
type ModifierGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  isActive?: boolean;
  items: ModifierItem[];
};

type SizeOption = { label: string; code: string };

/* ======================== API Helpers =========================== */

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

function absUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (u.startsWith("/uploads")) return `${API}${u}`;
  return u;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()) as T;
  } catch (err) {
    console.error("GET", path, err);
    return fallback;
  }
}
async function postJson<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}
async function del(path: string): Promise<void> {
  const r = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}
async function putJson<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

// PATCH helper (for modifier groups & items)
async function patchJson<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

async function postForm<T>(path: string, fd: FormData): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}
async function putForm<T>(path: string, fd: FormData): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: "PUT", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

/* ======================= Tiny UI helpers ======================== */

function ActiveBadge({ active }: { active?: boolean }) {
  const on = !!active;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? "bg-emerald-500/90 text-white" : "bg-rose-500/90 text-white"
        }`}
      aria-label={on ? "Active" : "Inactive"}
      title={on ? "Active" : "Inactive"}
    >
      {on ? "Active" : "Inactive"}
    </span>
  );
}

function SectionCard(
  props: React.PropsWithChildren<{
    title?: string;
    subtitle?: string;
    right?: React.ReactNode;
    className?: string;
  }>
) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm ${props.className || ""
        }`}
    >
      {(props.title || props.right || props.subtitle) && (
        <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {props.title && (
              <h3 className="text-sm font-semibold text-slate-900">
                {props.title}
              </h3>
            )}
            {props.subtitle && (
              <p className="text-xs text-slate-500">{props.subtitle}</p>
            )}
          </div>
          <div>{props.right}</div>
        </div>
      )}
      <div className="p-4">{props.children}</div>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center text-slate-600">
      <div className="flex size-10 items-center justify-center rounded-full bg-slate-100">
        <span className="text-sm">🧺</span>
      </div>
      <div className="text-sm font-medium">{title}</div>
      {hint ? <div className="text-xs">{hint}</div> : null}
    </div>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
}: React.PropsWithChildren<{ open: boolean; onClose: () => void; title: string }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <button className="btn-ghost text-xs" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Percent formatter & tax badge  ---------- */

function formatPercent(rate?: number | null) {
  if (rate == null || !isFinite(Number(rate))) return null;
  const n = Number(rate);
  const v = n < 1 ? n * 100 : n; // accepts 0.15 or 15
  const s = (Math.round(v * 100) / 100).toString();
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}

function getProductTax(product: Product, taxes: Tax[]): Tax | null {
  if (product.tax) return product.tax;
  if (product.taxId != null) {
    const found = taxes.find((t) => t.id === product.taxId) || null;
    if (found) return found;
  }
  return null;
}

function TaxBadge({ product, taxes }: { product: Product; taxes: Tax[] }) {
  const tax = getProductTax(product, taxes);
  const rawRate = tax?.rate ?? product.taxRate;
  const shown = formatPercent(rawRate);
  if (!shown) return null;
  const name = tax?.name || "VAT";
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] leading-4 text-slate-600">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      {name} {shown}%
    </span>
  );
}

/* ============================ Page ============================== */

export default function MenuPage() {
  // shared data
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  // preset size options (API + fallback)
  const [sizeOptions, setSizeOptions] = useState<SizeOption[]>([]);

  // toolbar state
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("");

  // product → modifiers linking panel state
  const [linkForProductId, setLinkForProductId] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, ModifierGroup[]>>({});

  // edit dialogs
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const toast = useToast();

  const refreshSizes = async () => {
    const so = await getJson<SizeOption[]>("/menu/size-options", [
      { label: "Small", code: "S" },
      { label: "Regular", code: "R" },
      { label: "Large", code: "L" },
      { label: "XL", code: "XL" },
    ]);
    setSizeOptions(so);
  };

  const refresh = async () => {
    setLoading(true);
    const [c, p, g, t] = await Promise.all([
      getJson<Category[]>("/menu/categories", []),
      getJson<Product[]>("/menu/products?includeInactive=true", []),
      getJson<ModifierGroup[]>("/menu/modifiers", []),
      getJson<Tax[]>("/settings/taxes", []),
    ]);
    setCategories(c);
    setProducts(p);
    setGroups(g);
    setTaxes(t.filter((x) => x.isActive !== false));
    await refreshSizes();
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  // helper: choose first unused preset
  function nextUnusedPreset(
    current: { name: string }[],
    options: SizeOption[]
  ): SizeOption {
    const used = new Set(current.map((s) => s.name));
    return options.find((o) => !used.has(o.label)) ?? options[0];
  }

  // filter products
  const filtered = useMemo(() => {
    let arr = products;
    if (catFilter) arr = arr.filter((p) => p.categoryId === catFilter);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter(
        (p) =>
          p.name.toLowerCase().includes(t) ||
          p.sku.toLowerCase().includes(t) ||
          p.sizes?.some((s) => s.name.toLowerCase().includes(t))
      );
    }
    return arr;
  }, [products, catFilter, q]);

  /* ======================== Categories Tab ======================= */

  function CategoriesTab() {
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    async function addCategory(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      if (!name.trim()) {
        setError("Category name is required");
        return;
      }
      setSaving(true);
      try {
        const fd = new FormData();
        fd.set("name", name.trim());
        if (file) fd.set("image", file);
        await postForm("/menu/categories", fd);
        setName("");
        setFile(null);
        setPreview(null);
        toast.push({ kind: "success", text: "Category created" });
        startTransition(refresh);
      } catch (err: any) {
        setError(err?.message?.slice(0, 200) || "Failed to create category");
        toast.push({ kind: "error", text: "Failed to create category" });
      } finally {
        setSaving(false);
      }
    }

    return (
      <div className="space-y-5">
        <SectionCard
          title="Create Category"
          subtitle="Add a new category to group products in your POS."
          right={
            saving ? (
              <span className="text-xs text-slate-500">Saving…</span>
            ) : null
          }
        >
          <form
            onSubmit={addCategory}
            className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
          >
            <div className="space-y-3">
              <input
                className="input w-full"
                placeholder="Category name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    setPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
                {preview ? (
                  <img
                    src={preview}
                    alt="preview"
                    className="h-12 w-12 rounded-lg border object-cover shadow-sm"
                  />
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500">
                JPEG/PNG. Square images (e.g. 512×512) look best on POS tiles.
              </p>
            </div>

            <div className="flex items-end justify-end">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add Category"}
              </button>
            </div>
          </form>
          {error && (
            <div className="mt-3 text-sm text-rose-600">{error}</div>
          )}
        </SectionCard>

        <SectionCard
          title="Categories"
          subtitle="Manage ordering, images, and visibility."
        >
          {loading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-11 rounded-xl" />
              ))}
            </div>
          ) : categories.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEditingCategory(c)}
                  className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    {c.imageUrl ? (
                      <img
                        src={absUrl(c.imageUrl)}
                        alt={c.name}
                        className="h-8 w-8 rounded-lg border object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800">
                        {c.name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Sort: {c.sort ?? 0}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 opacity-0 transition group-hover:opacity-100">
                    Edit
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No categories"
              hint="Create your first category above."
            />
          )}
        </SectionCard>

        <EditCategoryModal
          open={!!editingCategory}
          initial={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSaved={() => {
            setEditingCategory(null);
            startTransition(refresh);
          }}
        />
      </div>
    );
  }

  /* ========================= Products Tab ======================== */

  function ProductsTab() {
    const [sku, setSku] = useState("");
    const [name, setName] = useState("");
    const [categoryId, setCategoryId] = useState<string>("");
    const [taxId, setTaxId] = useState<number | null>(null);
    const [sizes, setSizes] = useState<Size[]>([
      { name: "Regular", price: 0, code: "R" },
    ]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    function updateSizeName(i: number, name: string) {
      const opt = sizeOptions.find((o) => o.label === name);
      setSizes((prev) => {
        const next = prev.slice();
        next[i] = { ...next[i], name, code: opt?.code ?? null };
        return next;
      });
    }
    function updateSizePrice(i: number, price: number) {
      setSizes((prev) => {
        const next = prev.slice();
        next[i] = { ...next[i], price: Number.isFinite(price) ? price : 0 };
        return next;
      });
    }
    function addSize() {
      const pick = nextUnusedPreset(sizes, sizeOptions);
      setSizes((prev) => [
        ...prev,
        { name: pick.label, price: 0, code: pick.code },
      ]);
    }
    function removeSize(i: number) {
      setSizes((prev) => prev.filter((_, idx) => idx !== i));
    }

    async function addProduct(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      if (!name.trim() || !categoryId) {
        setError("Name and category are required");
        return;
      }
      setSaving(true);
      try {
        const fd = new FormData();
        if (sku.trim()) fd.set("sku", sku.trim());
        fd.set("name", name.trim());
        fd.set("categoryId", categoryId);
        if (taxId != null) fd.set("taxId", String(taxId));
        fd.set(
          "sizes",
          JSON.stringify(
            sizes.map((s) => ({
              name: s.name,
              price: s.price,
              code: s.code ?? null,
            }))
          )
        );
        if (file) fd.set("image", file);

        await postForm("/menu/products", fd);

        setSku("");
        setName("");
        setCategoryId("");
        setTaxId(null);
        setSizes([{ name: "Regular", price: 0, code: "R" }]);
        setFile(null);
        setPreview(null);
        toast.push({ kind: "success", text: "Product created" });
        startTransition(refresh);
      } catch (err: any) {
        setError(err?.message?.slice(0, 200) || "Failed to create product");
        toast.push({ kind: "error", text: "Failed to create product" });
      } finally {
        setSaving(false);
      }
    }

    const grouped = useMemo(() => {
      const map = new Map<string, Product[]>();
      for (const p of filtered) {
        const k = p.categoryId || "uncat";
        map.set(k, [...(map.get(k) || []), p]);
      }
      return map;
    }, [filtered]);

    function copySku(sku: string) {
      navigator.clipboard?.writeText(sku);
      toast.push({ kind: "info", text: `SKU copied: ${sku}` });
    }

    async function loadLinks(productId: string) {
      const list = await getJson<ModifierGroup[]>(
        `/menu/products/${productId}/modifiers`,
        []
      );
      setLinks((prev) => ({ ...prev, [productId]: list }));
    }
    function toggleLinkPanel(productId: string) {
      if (linkForProductId === productId) {
        setLinkForProductId(null);
      } else {
        setLinkForProductId(productId);
        if (!links[productId]) loadLinks(productId);
      }
    }

    async function attach(productId: string, modifierId: string) {
      await postJson(`/menu/products/${productId}/modifiers/${modifierId}`, {});
      await loadLinks(productId);
      toast.push({ kind: "success", text: "Modifier attached" });
    }
    async function detach(productId: string, modifierId: string) {
      await del(`/menu/products/${productId}/modifiers/${modifierId}`);
      await loadLinks(productId);
      toast.push({ kind: "success", text: "Modifier detached" });
    }

    return (
      <div className="space-y-6">
        <SectionCard
          title="Create Product"
          subtitle="Define core details, VAT, sizes and image."
          right={
            saving ? (
              <span className="text-xs text-slate-500">Saving…</span>
            ) : null
          }
        >
          <form
            onSubmit={addProduct}
            className="grid gap-4 md:grid-cols-4 md:items-start"
          >
            <input
              className="input md:col-span-1"
              placeholder="SKU (leave empty for auto)"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
            <input
              className="input md:col-span-2"
              placeholder="Product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="select md:col-span-1"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Tax selection */}
            <div className="md:col-span-2 space-y-1">
              <div className="text-[11px] font-medium text-slate-500">VAT</div>
              <select
                className="select w-full"
                value={taxId ?? ""}
                onChange={(e) =>
                  setTaxId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">No VAT</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({Number(t.rate)}%)
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Prices are VAT-inclusive.
              </p>
            </div>

            {/* Image picker + preview */}
            <div className="md:col-span-2 space-y-2">
              <div className="text-[11px] font-medium text-slate-500">
                Product image
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    setPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
                {preview ? (
                  <img
                    src={preview}
                    alt="preview"
                    className="h-16 w-16 rounded-lg border object-cover shadow-sm"
                  />
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500">
                Optional. This image will appear on POS tiles.
              </p>
            </div>

            {/* Sizes & Prices */}
            <div className="md:col-span-4 space-y-3 pt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sizes &amp; prices
              </div>

              {sizes.map((s, i) => {
                const hasCustom =
                  s.name && !sizeOptions.some((o) => o.label === s.name);
                return (
                  <div
                    key={i}
                    className="grid gap-2 rounded-xl bg-slate-50/80 p-3 md:grid-cols-[260px_160px_auto]"
                  >
                    <select
                      className="select"
                      value={s.name}
                      onChange={(e) => updateSizeName(i, e.target.value)}
                    >
                      {hasCustom && (
                        <option value={s.name}>{s.name} (custom)</option>
                      )}
                      {sizeOptions.map((o) => (
                        <option key={o.code} value={o.label}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price"
                      value={Number.isFinite(s.price) ? s.price : 0}
                      onChange={(e) =>
                        updateSizePrice(i, Number(e.target.value || 0))
                      }
                    />
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => removeSize(i)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={addSize}
              >
                + Add size
              </button>
              <p className="text-[11px] text-slate-500">
                Size code is set automatically (e.g., Regular → R).
              </p>
            </div>

            <div className="md:col-span-4 flex justify-end">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create Product"}
              </button>
            </div>
          </form>
          {error && (
            <div className="mt-3 text-sm text-rose-600">{error}</div>
          )}
        </SectionCard>

        {loading ? (
          <SectionCard title="Products" subtitle="Loading products…">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-12 rounded-xl" />
              ))}
            </div>
          </SectionCard>
        ) : (
          [...grouped.entries()].map(([catId, prods]) => {
            const cname =
              categories.find((c) => c.id === catId)?.name || "Uncategorized";
            return (
              <SectionCard
                key={catId}
                title={`${cname} (${prods.length})`}
                subtitle="Click SKU to copy or link modifier groups to products."
              >
                <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200 bg-slate-50/40">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100/90 text-left text-slate-600 backdrop-blur-sm">
                      <tr>
                        <th className="px-3 py-2 font-medium">Image</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Sizes</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {prods.map((p) => {
                        const open = linkForProductId === p.id;
                        const productLinks = links[p.id] || [];
                        return (
                          <>
                            <tr
                              key={p.id}
                              className="border-t border-slate-100 bg-white/70 align-top hover:bg-slate-50/80"
                            >
                              <td className="px-3 py-2">
                                {p.imageUrl ? (
                                  <img
                                    src={absUrl(p.imageUrl)}
                                    alt={p.name}
                                    className="h-10 w-10 rounded-lg border object-cover shadow-sm"
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-500">
                                    {p.name.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px]">
                                <button
                                  onClick={() => copySku(p.sku)}
                                  className="rounded px-1 py-0.5 text-[11px] underline-offset-2 hover:bg-slate-100 hover:underline"
                                >
                                  {p.sku}
                                </button>
                              </td>

                              {/* Name + VAT badge here */}
                              <td className="px-3 py-2 font-medium text-slate-800">
                                <div>{p.name}</div>
                                <TaxBadge product={p} taxes={taxes} />
                              </td>

                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {p.sizes?.map((s, idx) => (
                                    <span
                                      key={idx}
                                      className="tag bg-slate-100 text-[11px]"
                                    >
                                      {s.name}:{" "}
                                      {new Intl.NumberFormat("en-SA", {
                                        style: "currency",
                                        currency: "SAR",
                                      }).format(s.price)}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              <td className="px-3 py-2">
                                <ActiveBadge active={p.isActive} />
                              </td>

                              <td className="px-3 py-2 text-right space-x-2">
                                <button
                                  className="btn-ghost text-xs"
                                  onClick={() => setEditingProduct(p)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn-ghost text-xs"
                                  onClick={() => toggleLinkPanel(p.id)}
                                >
                                  {open ? "Close modifiers" : "Link modifiers"}
                                </button>
                              </td>
                            </tr>

                            {open && (
                              <tr>
                                <td colSpan={6} className="px-6 pb-4">
                                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-left">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <div className="text-xs font-semibold text-slate-600">
                                        Linked groups
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        Attach multiple modifier groups to this
                                        product.
                                      </div>
                                    </div>
                                    <div className="mb-3 flex flex-wrap gap-2">
                                      {productLinks.length ? (
                                        productLinks.map((g) => (
                                          <span
                                            key={g.id}
                                            className="inline-flex items-center gap-2 rounded-full bg-white px-2 py-1 text-[11px] text-slate-700 shadow-sm"
                                          >
                                            {g.name}
                                            <button
                                              className="rounded-md border border-slate-300 px-2 py-0.5 text-[10px] hover:bg-slate-50"
                                              onClick={() => detach(p.id, g.id)}
                                            >
                                              Remove
                                            </button>
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-xs text-slate-500">
                                          No groups linked yet.
                                        </span>
                                      )}
                                    </div>

                                    <div className="text-xs font-semibold text-slate-600">
                                      Attach group
                                    </div>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                                      {groups.map((g) => {
                                        const already = productLinks.some(
                                          (pg) => pg.id === g.id
                                        );
                                        return (
                                          <div
                                            key={g.id}
                                            className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="font-medium text-slate-800">
                                                {g.name}
                                              </div>
                                              <button
                                                disabled={already}
                                                onClick={() =>
                                                  attach(p.id, g.id)
                                                }
                                                className={`rounded-md border px-2 py-1 text-[11px] ${already
                                                    ? "cursor-default opacity-50"
                                                    : "hover:bg-slate-50"
                                                  }`}
                                              >
                                                {already ? "Linked" : "Link"}
                                              </button>
                                            </div>
                                            <div className="mt-1 text-[11px] text-slate-500">
                                              Min {g.min} • Max {g.max}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                      {!prods.length && (
                        <tr>
                          <td colSpan={6} className="px-3 py-4">
                            <EmptyState title="No products in this category" />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            );
          })
        )}

        <EditProductModal
          open={!!editingProduct}
          initial={editingProduct}
          categories={categories}
          sizeOptions={sizeOptions}
          taxes={taxes}
          onClose={() => setEditingProduct(null)}
          onSaved={() => {
            setEditingProduct(null);
            startTransition(refresh);
          }}
        />
      </div>
    );
  }

  /* ========================= Sizes Tab ======================== */

  function SizesTab() {
    const [list, setList] = useState<SizeOption[]>([]);
    const [loadingSO, setLoadingSO] = useState(true);

    // create form
    const [nLabel, setNLabel] = useState("");
    const [nCode, setNCode] = useState("");

    useEffect(() => {
      (async () => {
        setLoadingSO(true);
        const so = await getJson<SizeOption[]>("/menu/size-options", []);
        setList(so);
        setLoadingSO(false);
      })();
    }, [sizeOptions]); // refresh when outer list changes

    async function add(e: React.FormEvent) {
      e.preventDefault();
      const label = nLabel.trim();
      const code = nCode.trim().toUpperCase();
      if (!label || !code) return;
      if (
        list.some(
          (s) =>
            s.label.toLowerCase() === label.toLowerCase() ||
            s.code.toUpperCase() === code
        )
      ) {
        toast.push({ kind: "error", text: "Duplicate label or code" });
        return;
      }
      try {
        await postJson("/menu/size-options", { label, code });
        setNLabel("");
        setNCode("");
        toast.push({ kind: "success", text: "Size added" });
        await refreshSizes();
        setList(await getJson<SizeOption[]>("/menu/size-options", []));
      } catch (e: any) {
        toast.push({ kind: "error", text: e?.message || "Failed to add size" });
      }
    }

    async function saveRow(idx: number, patch: Partial<SizeOption>) {
      const row = list[idx];
      const nextLabel = (patch.label ?? row.label).trim();
      const nextCode = (patch.code ?? row.code).trim().toUpperCase();
      // client-side duplicate guard
      if (
        list.some(
          (s, i) =>
            i !== idx &&
            (s.label.toLowerCase() === nextLabel.toLowerCase() ||
              s.code.toUpperCase() === nextCode)
        )
      ) {
        toast.push({ kind: "error", text: "Duplicate label/code" });
        return;
      }
      try {
        await putJson(`/menu/size-options/${row.code}`, {
          label: nextLabel,
          code: nextCode,
        });
        toast.push({ kind: "success", text: "Size updated" });
        await refreshSizes();
        setList(await getJson<SizeOption[]>("/menu/size-options", []));
      } catch (e: any) {
        toast.push({
          kind: "error",
          text: e?.message || "Failed to update size",
        });
      }
    }

    async function removeRow(code: string) {
      if (!confirm("Remove this size?")) return;
      try {
        await del(`/menu/size-options/${code}`);
        toast.push({ kind: "success", text: "Size removed" });
        await refreshSizes();
        setList(await getJson<SizeOption[]>("/menu/size-options", []));
      } catch (e: any) {
        toast.push({
          kind: "error",
          text: e?.message || "Failed to remove size",
        });
      }
    }

    return (
      <div className="space-y-6">
        <SectionCard
          title="Add Size"
          subtitle="Preset sizes speed up product creation across branches."
        >
          <form
            onSubmit={add}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_160px_auto]"
          >
            <input
              className="input"
              placeholder='Label (e.g., "Regular")'
              value={nLabel}
              onChange={(e) => setNLabel(e.target.value)}
            />
            <input
              className="input"
              placeholder='Code (e.g., "R")'
              value={nCode}
              onChange={(e) => setNCode(e.target.value)}
            />
            <button className="btn-primary" type="submit">
              Add
            </button>
          </form>
          <p className="mt-2 text-[11px] text-slate-500">
            Label is shown to users. Code is stored with products (e.g., S/R/L).
          </p>
        </SectionCard>

        <SectionCard
          title="All Sizes"
          subtitle="Inline edit labels and codes. Changes apply to future products."
        >
          {loadingSO ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-xl" />
              ))}
            </div>
          ) : list.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Label</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s, idx) => (
                    <tr key={s.code} className="border-t bg-white/70">
                      <td className="px-3 py-2">
                        <input
                          className="input w-full"
                          defaultValue={s.label}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            saveRow(idx, { label: e.target.value.trim() })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input w-40"
                          defaultValue={s.code}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            saveRow(idx, {
                              code: e.target.value.trim().toUpperCase(),
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="btn-ghost text-xs"
                          onClick={() => removeRow(s.code)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No sizes yet"
              hint="Add your first size above."
            />
          )}
        </SectionCard>
      </div>
    );
  }

  /* ========================= Modifiers Tab ======================== */

  function ModifiersTab() {
    const [name, setName] = useState("");
    const [min, setMin] = useState(0);
    const [max, setMax] = useState(1);
    const [savingGroup, setSavingGroup] = useState(false);

    const [selectedGroup, setSelectedGroup] = useState<string>("");
    const [itemName, setItemName] = useState("");
    const [itemPrice, setItemPrice] = useState<number>(0);
    const [itemTaxId, setItemTaxId] = useState<number | null>(null);
    const [savingItem, setSavingItem] = useState(false);

    async function addGroup(e: React.FormEvent) {
      e.preventDefault();
      if (!name.trim()) return;
      setSavingGroup(true);
      try {
        await postJson("/menu/modifiers", {
          name,
          min: Number(min),
          max: Number(max),
        });
        setName("");
        setMin(0);
        setMax(1);
        toast.push({ kind: "success", text: "Group created" });
        startTransition(refresh);
      } catch (e: any) {
        toast.push({
          kind: "error",
          text: e?.message || "Failed to create group",
        });
      } finally {
        setSavingGroup(false);
      }
    }

    async function addItem(e: React.FormEvent) {
      e.preventDefault();
      if (!selectedGroup || !itemName.trim()) return;
      setSavingItem(true);
      try {
        await postJson(`/menu/modifiers/${selectedGroup}/items`, {
          name: itemName,
          price: Number(itemPrice),
          taxId: itemTaxId,
        });
        setItemName("");
        setItemPrice(0);
        setItemTaxId(null);
        toast.push({ kind: "success", text: "Item added" });
        startTransition(refresh);
      } catch (e: any) {
        toast.push({
          kind: "error",
          text: e?.message || "Failed to add item",
        });
      } finally {
        setSavingItem(false);
      }
    }

    async function saveGroup(g: ModifierGroup, patch: Partial<ModifierGroup>) {
      try {
        await patchJson(`/menu/modifiers/${g.id}`, patch);
        toast.push({ kind: "success", text: "Group updated" });
        startTransition(refresh);
      } catch (e: any) {
        toast.push({
          kind: "error",
          text: e?.message || "Failed to update group",
        });
      }
    }

    async function saveItem(
      g: ModifierGroup,
      it: ModifierItem,
      patch: Partial<ModifierItem>
    ) {
      try {
        await patchJson(`/menu/modifiers/${g.id}/items/${it.id}`, patch);
        toast.push({ kind: "success", text: "Item updated" });
        startTransition(refresh);
      } catch (e: any) {
        toast.push({
          kind: "error",
          text: e?.message || "Failed to update item",
        });
      }
    }

    return (
      <div className="space-y-6">
        {/* create group */}
        <SectionCard
          title="Create Modifier Group"
          subtitle="Build groups like “Add Ons” or “Sauce choice”."
          right={
            savingGroup ? (
              <span className="text-xs text-slate-500">Saving…</span>
            ) : null
          }
        >
          <form
            onSubmit={addGroup}
            className="flex flex-wrap items-end gap-2"
          >
            <input
              className="input w-64"
              placeholder="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="number"
              className="input w-24"
              placeholder="Min"
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
            />
            <input
              type="number"
              className="input w-24"
              placeholder="Max"
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
            <button className="btn-primary" type="submit" disabled={savingGroup}>
              {savingGroup ? "Adding…" : "Add Group"}
            </button>
          </form>
        </SectionCard>

        {/* add item */}
        <SectionCard
          title="Add Item to Group"
          subtitle="Attach individual modifier choices with pricing and VAT."
          right={
            savingItem ? (
              <span className="text-xs text-slate-500">Saving…</span>
            ) : null
          }
        >
          <form
            onSubmit={addItem}
            className="grid gap-2 md:grid-cols-[1.4fr_1.4fr_140px_160px_auto]"
          >
            <select
              className="select"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="">Select group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} (min {g.min} • max {g.max})
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Item name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Price"
              value={Number.isFinite(itemPrice) ? itemPrice : 0}
              onChange={(e) => setItemPrice(Number(e.target.value || 0))}
            />
            <select
              className="select"
              value={itemTaxId ?? ""}
              onChange={(e) =>
                setItemTaxId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">No tax</option>
              {taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({Number(t.rate)}%)
                </option>
              ))}
            </select>
            <button className="btn-ghost" type="submit" disabled={savingItem}>
              {savingItem ? "Adding…" : "Add Item"}
            </button>
          </form>
          <p className="mt-2 text-[11px] text-slate-500">
            Modifier item prices are VAT-inclusive; if no VAT is selected, the
            product’s VAT will be used during cart calculation.
          </p>
        </SectionCard>

        {/* all groups */}
        <SectionCard
          title="All Modifier Groups"
          subtitle="Tweak names, limits, VAT and active state inline."
        >
          {groups.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 overflow-hidden"
                >
                  {/* header row: name / min / max */}
                  <div className="grid grid-cols-[minmax(0,1.7fr)_90px_90px] gap-2">
                    <div>
                      <div className="text-[11px] text-slate-500">Name</div>
                      <input
                        className="input w-full"
                        defaultValue={g.name}
                        onBlur={(e) =>
                          e.target.value.trim() &&
                          saveGroup(g, { name: e.target.value.trim() })
                        }
                      />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Min</div>
                      <input
                        type="number"
                        className="input w-full"
                        defaultValue={g.min}
                        onBlur={(e) =>
                          saveGroup(g, { min: Number(e.target.value || 0) })
                        }
                      />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Max</div>
                      <input
                        type="number"
                        className="input w-full"
                        defaultValue={g.max}
                        onBlur={(e) =>
                          saveGroup(g, { max: Number(e.target.value || 0) })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm">
                      <input
                        type="checkbox"
                        className="mr-2 align-middle"
                        defaultChecked={!!g.isActive}
                        onChange={(e) =>
                          saveGroup(g, { isActive: e.target.checked })
                        }
                      />
                      Active
                    </label>
                    <span className="text-[11px] text-slate-500">
                      {g.items?.length || 0} items
                    </span>
                  </div>

                  <div className="mt-1 text-xs font-semibold text-slate-600">
                    Items
                  </div>

                  <div className="flex flex-col gap-2">
                    {g.items?.length ? (
                      g.items.map((it) => (
                        <div
                          key={it.id}
                          className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm"
                        >
                          <input
                            className="input col-span-4"
                            defaultValue={it.name}
                            onBlur={(e) =>
                              e.target.value.trim() &&
                              saveItem(g, it, { name: e.target.value.trim() })
                            }
                          />
                          <input
                            className="input col-span-3"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={it.price}
                            onBlur={(e) =>
                              saveItem(g, it, {
                                price: Number(e.target.value || 0),
                              })
                            }
                          />
                          <select
                            className="select col-span-3"
                            defaultValue={it.taxId ?? ""}
                            onChange={(e) =>
                              saveItem(g, it, {
                                taxId: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                          >
                            <option value="">No VAT</option>
                            {taxes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({Number(t.rate)}%)
                              </option>
                            ))}
                          </select>
                          <label className="col-span-1 text-[11px]">
                            <input
                              type="checkbox"
                              className="mr-1 align-middle"
                              defaultChecked={!!it.isActive}
                              onChange={(e) =>
                                saveItem(g, it, { isActive: e.target.checked })
                              }
                            />
                            Active
                          </label>
                          <div className="col-span-1 text-right text-[10px] text-slate-400">
                            id:{it.id.slice(0, 4)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">No items</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No modifier groups yet"
              hint="Create your first group above."
            />
          )}
        </SectionCard>
      </div>
    );
  }

  /* ============================== Shell =========================== */

  const total = filtered.length;
  const totalAll = products.length;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-4">
      {/* Page header */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">

          </div>
          <div className="text-lg font-semibold text-slate-900">

          </div>
          <p className="text-xs text-slate-500">

          </p>
        </div>
      </div>

      {/* Sticky tools */}
      <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">Products</span>
            <span className="ml-2 text-slate-500">
              {total}/{totalAll} visible with current filters
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-56"
              placeholder="Search name / SKU / size…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="select w-48"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost flex items-center gap-2 text-xs"
              onClick={() => startTransition(refresh)}
              disabled={isPending}
            >
              {isPending ? <Spinner /> : null}
              Refresh
            </button>
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          { label: "Categories", content: <CategoriesTab /> },
          { label: "Products", content: <ProductsTab /> },
          { label: "Sizes", content: <SizesTab /> },
          { label: "Modifiers", content: <ModifiersTab /> },
        ]}
      />

      <ToastStack items={toast.items} remove={toast.remove} />
    </div>
  );
}

/* ====================== Edit Category Modal ====================== */

function EditCategoryModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [sort, setSort] = useState<number>(initial?.sort ?? 0);
  const [isActive, setIsActive] = useState<boolean>(!!initial?.isActive);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initial?.name || "");
    setSort(initial?.sort ?? 0);
    setIsActive(!!initial?.isActive);
    setFile(null);
    setPreview(null);
    setRemoveImage(false);
  }, [initial]);

  if (!initial) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      if (name.trim()) fd.set("name", name.trim());
      fd.set("sort", String(Number(sort) || 0));
      fd.set("isActive", String(!!isActive));
      if (file) fd.set("image", file);
      if (removeImage) fd.set("removeImage", "true");
      await putForm(`/menu/categories/${initial.id}`, fd);
      onSaved();
    } catch (err: any) {
      alert(err?.message || "Failed to update category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Category">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <div className="text-[11px] text-slate-500">Name</div>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Sort</div>
            <input
              className="input w-full"
              type="number"
              value={sort}
              onChange={(e) => setSort(Number(e.target.value || 0))}
            />
          </div>
          <div className="flex items-end">
            <label className="text-sm">
              <input
                type="checkbox"
                className="mr-2 align-middle"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          </div>
          <div className="col-span-2">
            <div className="text-[11px] text-slate-500">Photo</div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setPreview(f ? URL.createObjectURL(f) : null);
                  if (f) setRemoveImage(false);
                }}
              />
              {preview ? (
                <img
                  src={preview}
                  alt="preview"
                  className="h-16 w-16 rounded-lg border object-cover"
                />
              ) : initial.imageUrl ? (
                <img
                  src={absUrl(initial.imageUrl)}
                  alt={initial.name}
                  className="h-16 w-16 rounded-lg border object-cover"
                />
              ) : null}
              <label className="text-sm">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={removeImage}
                  onChange={(e) => {
                    setRemoveImage(e.target.checked);
                    if (e.target.checked) {
                      setFile(null);
                      setPreview(null);
                    }
                  }}
                />
                Remove image
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ====================== Edit Product Modal ====================== */

function EditProductModal({
  open,
  initial,
  categories,
  sizeOptions,
  taxes,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Product | null;
  categories: Category[];
  sizeOptions: SizeOption[];
  taxes: Tax[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sku, setSku] = useState(initial?.sku || "");
  const [name, setName] = useState(initial?.name || "");
  const [categoryId, setCategoryId] = useState<string>(
    initial?.categoryId || ""
  );
  const [taxId, setTaxId] = useState<number | null>(initial?.taxId ?? null);
  const [sizes, setSizes] = useState<Size[]>(
    initial?.sizes?.length
      ? initial.sizes.map((s) => ({
        name: s.name,
        price: Number(s.price) || 0,
        code: s.code ?? null,
      }))
      : []
  );
  const [isActive, setIsActive] = useState<boolean>(!!initial?.isActive);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSku(initial?.sku || "");
    setName(initial?.name || "");
    setCategoryId(initial?.categoryId || "");
    setTaxId(initial?.taxId ?? null);
    setSizes(
      initial?.sizes?.length
        ? initial.sizes.map((s) => ({
          name: s.name,
          price: Number(s.price) || 0,
          code: s.code ?? null,
        }))
        : []
    );
    setIsActive(!!initial?.isActive);
    setFile(null);
    setPreview(null);
    setRemoveImage(false);
  }, [initial]);

  if (!initial) return null;

  function updateSize(i: number, key: "name" | "price", v: string) {
    if (key === "name") {
      const opt = sizeOptions.find((o) => o.label === v);
      setSizes((prev) => {
        const next = prev.slice();
        next[i] = { ...next[i], name: v, code: opt?.code ?? null };
        return next;
      });
    } else {
      setSizes((prev) => {
        const next = prev.slice();
        next[i] = { ...next[i], price: Number(v || 0) };
        return next;
      });
    }
  }
  function addSize() {
    const pick = sizeOptions.length
      ? sizeOptions.find((o) => !sizes.some((s) => s.name === o.label)) ??
      sizeOptions[0]
      : { label: "Regular", code: "R" };
    setSizes((prev) => [
      ...prev,
      { name: pick.label, price: 0, code: pick.code },
    ]);
  }
  function removeSize(i: number) {
    setSizes((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      if (sku.trim()) fd.set("sku", sku.trim());
      if (name.trim()) fd.set("name", name.trim());
      if (categoryId) fd.set("categoryId", categoryId);
      fd.set("isActive", String(!!isActive));
      fd.set(
        "sizes",
        JSON.stringify(
          sizes.map((s) => ({
            name: s.name,
            price: s.price,
            code: s.code ?? null,
          }))
        )
      );
      if (file) fd.set("image", file);
      if (removeImage) fd.set("removeImage", "true");
      if (taxId != null) fd.set("taxId", String(taxId));

      await putForm(`/menu/products/${initial.id}`, fd);
      onSaved();
    } catch (err: any) {
      alert(err?.message || "Failed to update product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Product">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] text-slate-500">SKU</div>
            <input
              className="input w-full"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Name</div>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Category</div>
            <select
              className="select w-full"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="text-sm">
              <input
                type="checkbox"
                className="mr-2 align-middle"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          </div>

          {/* Tax select */}
          <div className="md:col-span-2">
            <div className="text-[11px] text-slate-500">VAT</div>
            <select
              className="select w-full"
              value={taxId ?? ""}
              onChange={(e) =>
                setTaxId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">No tax</option>
              {taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({Number(t.rate)}%)
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-[11px] text-slate-500">Photo</div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setPreview(f ? URL.createObjectURL(f) : null);
                  if (f) setRemoveImage(false);
                }}
              />
              {preview ? (
                <img
                  src={preview}
                  alt="preview"
                  className="h-16 w-16 rounded-lg border object-cover"
                />
              ) : initial.imageUrl ? (
                <img
                  src={absUrl(initial.imageUrl)}
                  alt={initial.name}
                  className="h-16 w-16 rounded-lg border object-cover"
                />
              ) : null}
              <label className="text-sm">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={removeImage}
                  onChange={(e) => {
                    setRemoveImage(e.target.checked);
                    if (e.target.checked) {
                      setFile(null);
                      setPreview(null);
                    }
                  }}
                />
                Remove image
              </label>
            </div>
          </div>

          <div className="md:col-span-2 space-y-2">
            <div className="text-xs font-medium text-slate-600">
              Sizes (replace existing)
            </div>
            {sizes.map((s, i) => {
              const hasCustom =
                s.name && !sizeOptions.some((o) => o.label === s.name);
              return (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <select
                    className="select col-span-5"
                    value={s.name}
                    onChange={(e) => updateSize(i, "name", e.target.value)}
                  >
                    {hasCustom && (
                      <option value={s.name}>{s.name} (custom)</option>
                    )}
                    {sizeOptions.map((o) => (
                      <option key={o.code} value={o.label}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  <input
                    className="input col-span-4"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price"
                    value={Number.isFinite(s.price) ? s.price : 0}
                    onChange={(e) => updateSize(i, "price", e.target.value)}
                  />

                  <div className="col-span-2 flex items-center text-xs text-slate-500">
                    {s.code ? (
                      <span className="tag bg-slate-100">
                        code: {s.code}
                      </span>
                    ) : (
                      <span className="opacity-60">no code</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn-ghost col-span-1 text-xs"
                    onClick={() => removeSize(i)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={addSize}
            >
              + Add size
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
