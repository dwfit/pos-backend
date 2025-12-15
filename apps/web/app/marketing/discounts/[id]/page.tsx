// apps/web/app/marketing/discounts/[id]/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

/* ----------------------------- auth + fetch ----------------------------- */

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
    try {
      const data = text ? JSON.parse(text) : null;
      const msg = data?.message || text || `Request failed: ${res.status}`;
      throw new Error(msg);
    } catch {
      throw new Error(text || `Request failed: ${res.status}`);
    }
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

/* ----------------------------- types ----------------------------- */

type DiscountQualification = 'PRODUCT' | 'ORDER' | 'ORDER_AND_PRODUCT';
type DiscountType = 'FIXED' | 'PERCENTAGE';
type OrderType = 'DINE_IN' | 'PICKUP' | 'DELIVERY' | 'DRIVE_THRU';

type Discount = {
  id: string;
  name: string;
  nameLocalized?: string | null;
  qualification: DiscountQualification;
  type: DiscountType;
  value: number;
  reference: string;
  taxable: boolean;
  maxDiscount?: number | null;
  minProductPrice?: number | null;
  orderTypes?: string | null; // CSV from backend
  applyAllBranches?: boolean;
  // optional target id arrays if backend returns them
  branchIds?: string[];
  categoryIds?: string[];
  productIds?: string[];      // legacy / helper
  productSizeIds?: string[];  // main source of truth for sizes
};

type Branch = {
  id: string;
  name: string;
  code?: string | null;
  reference?: string | null;
};

type Category = {
  id: string;
  name: string;
  isActive?: boolean;
};

// In flatSizes mode this represents a "Product + Size" row (id = ProductSize.id)
type Product = {
  id: string;              // ProductSize.id
  name: string;            // e.g. "Apple - Small"
  code?: string | null;    // size code or SKU
  isActive?: boolean;
};

/* ----------------------------- helpers ----------------------------- */

function qualificationLabel(q: DiscountQualification) {
  switch (q) {
    case 'PRODUCT':
      return 'Product';
    case 'ORDER':
      return 'Order';
    case 'ORDER_AND_PRODUCT':
      return 'Order & Product';
    default:
      return q;
  }
}

function formatDiscountAmount(d: Discount | null) {
  if (!d) return '—';
  if (d.type === 'PERCENTAGE') return `${d.value}%`;
  return d.value.toFixed(2);
}

function orderTypeLabel(o: OrderType) {
  switch (o) {
    case 'DINE_IN':
      return 'Dine In';
    case 'PICKUP':
      return 'Pick Up';
    case 'DELIVERY':
      return 'Delivery';
    case 'DRIVE_THRU':
      return 'Drive Thru';
    default:
      return o;
  }
}

const ALL_ORDER_TYPES: OrderType[] = [
  'DINE_IN',
  'PICKUP',
  'DELIVERY',
  'DRIVE_THRU',
];

function parseOrderTypes(csv: string | null | undefined): OrderType[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean) as OrderType[];
}

/* ----------------------------- main page ----------------------------- */

export default function DiscountDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [discount, setDiscount] = useState<Discount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNameLocalized, setEditNameLocalized] = useState('');
  const [editQualification, setEditQualification] =
    useState<DiscountQualification>('PRODUCT');
  const [editType, setEditType] = useState<DiscountType>('PERCENTAGE');
  const [editValue, setEditValue] = useState<string>('0');
  const [editMaxDiscount, setEditMaxDiscount] = useState<string>('');
  const [editMinPrice, setEditMinPrice] = useState<string>('');
  const [editTaxable, setEditTaxable] = useState(false);
  const [editOrderTypes, setEditOrderTypes] = useState<OrderType[]>([]);

  // branches modal
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const [applyAllBranches, setApplyAllBranches] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);

  // categories modal
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  // product + size modal
  const [productsOpen, setProductsOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  // IMPORTANT: these hold ProductSize IDs (matches backend DiscountProduct.productSizeId)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  /* ------------------------ load discount detail ------------------------ */

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchJson<Discount>(`${API_BASE}/discounts/${id}`)
      .then(data => {
        if (!mounted) return;
        setDiscount(data);

        setApplyAllBranches(!!data.applyAllBranches);

        // hydrate existing targets if backend returns them
        if (Array.isArray(data.branchIds)) {
          setSelectedBranchIds(data.branchIds);
        }
        if (Array.isArray(data.categoryIds)) {
          setSelectedCategoryIds(data.categoryIds);
        }

        // ✅ productSizeIds are the main source of truth
        if (Array.isArray(data.productSizeIds) && data.productSizeIds.length) {
          setSelectedProductIds(data.productSizeIds);
        } else if (Array.isArray(data.productIds) && data.productIds.length) {
          // fallback / backward compatibility
          setSelectedProductIds(data.productIds);
        }

        // edit defaults
        setEditName(data.name ?? '');
        setEditNameLocalized(data.nameLocalized ?? '');
        setEditQualification(data.qualification);
        setEditType(data.type);
        setEditValue(String(data.value ?? 0));
        setEditMaxDiscount(
          data.maxDiscount != null ? String(data.maxDiscount) : '',
        );
        setEditMinPrice(
          data.minProductPrice != null ? String(data.minProductPrice) : '',
        );
        setEditTaxable(!!data.taxable);
        setEditOrderTypes(parseOrderTypes(data.orderTypes));
      })
      .catch(err => {
        console.error('Load discount detail error', err);
        if (mounted) {
          alert('Failed to load discount.');
          router.back();
        }
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [id, router]);

  const title = discount?.name || 'Discount';

  /* ----------------------------- edit discount ----------------------------- */

  function toggleOrderType(t: OrderType) {
    setEditOrderTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t],
    );
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!discount) return;
    if (!editName.trim()) {
      alert('Name is required');
      return;
    }
    const valueNum = parseFloat(editValue || '0');
    if (Number.isNaN(valueNum) || valueNum < 0) {
      alert('Discount amount must be a non-negative number');
      return;
    }
    const maxNum =
      editMaxDiscount.trim() === '' ? undefined : Number(editMaxDiscount);
    if (maxNum != null && (Number.isNaN(maxNum) || maxNum < 0)) {
      alert('Maximum discount must be a non-negative number');
      return;
    }
    const minNum =
      editMinPrice.trim() === '' ? undefined : Number(editMinPrice);
    if (minNum != null && (Number.isNaN(minNum) || minNum < 0)) {
      alert('Minimum product price must be a non-negative number');
      return;
    }

    setSaving(true);
    try {
      const body: any = {
        name: editName.trim(),
        nameLocalized: editNameLocalized.trim() || undefined,
        qualification: editQualification,
        type: editType,
        value: valueNum,
        taxable: editTaxable,
        maxDiscount: maxNum,
        minProductPrice: minNum,
        orderTypes: editOrderTypes,
      };

      const updated = await fetchJson<Discount>(
        `${API_BASE}/discounts/${discount.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );

      setDiscount(updated);
      setEditOpen(false);
    } catch (err: any) {
      console.error('Save discount error', err);
      alert(`Failed to save discount: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!discount) return;
    if (!window.confirm('Are you sure you want to delete this discount?')) {
      return;
    }
    setDeleting(true);
    try {
      await fetchJson(`${API_BASE}/discounts/${discount.id}`, {
        method: 'DELETE',
      });
      router.push('/marketing/discounts');
    } catch (err: any) {
      console.error('Delete discount error', err);
      alert(`Failed to delete discount: ${err?.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  }

  /* ----------------------------- branches modal ---------------------------- */

  const filteredBranches = useMemo(() => {
    const q = branchSearch.toLowerCase();
    return branches.filter(
      b =>
        !q ||
        b.name.toLowerCase().includes(q) ||
        (b.code && b.code.toLowerCase().includes(q)) ||
        (b.reference && b.reference.toLowerCase().includes(q)),
    );
  }, [branches, branchSearch]);

  function toggleBranch(id: string) {
    setSelectedBranchIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  async function openBranchesModal() {
    setBranchesOpen(true);
    if (branches.length > 0) return;

    setBranchesLoading(true);
    try {
      // simple mode: just basic fields, ordered by name
      const data = await fetchJson<Branch[]>(
        `${API_BASE}/branches?simple=1&pageSize=500`,
      );
      setBranches(data);
    } catch (err) {
      console.error('Load branches error', err);
      alert('Failed to load branches.');
    } finally {
      setBranchesLoading(false);
    }
  }

  async function saveBranches() {
    if (!discount) return;

    setSaving(true);
    try {
      const body = {
        applyAllBranches,
        branchIds: applyAllBranches ? [] : selectedBranchIds,
      };

      const updated = await fetchJson<Discount>(
        `${API_BASE}/discounts/${discount.id}/targets`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );

      setDiscount(updated);
      if (Array.isArray(updated.branchIds)) {
        setSelectedBranchIds(updated.branchIds);
      }
      setApplyAllBranches(!!updated.applyAllBranches);
      setBranchesOpen(false);
    } catch (err: any) {
      console.error('Save branches error', err);
      alert(`Failed to save branches: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  /* ----------------------------- categories modal -------------------------- */

  const filteredCategories = useMemo(() => {
    const q = categorySearch.toLowerCase();
    return categories.filter(
      c =>
        c.isActive !== false &&
        (!q || c.name.toLowerCase().includes(q)),
    );
  }, [categories, categorySearch]);

  const allCategoriesSelected =
    categories.length > 0 &&
    selectedCategoryIds.length === categories.length;

  function toggleCategory(id: string) {
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  async function openCategoriesModal() {
    setCategoriesOpen(true);
    if (categories.length > 0) return;

    setCategoriesLoading(true);
    try {
      const data = await fetchJson<Category[]>(`${API_BASE}/menu/categories`);
      setCategories(data.filter(c => c.isActive !== false));
    } catch (err) {
      console.error('Load categories error', err);
      alert('Failed to load categories.');
    } finally {
      setCategoriesLoading(false);
    }
  }

  function toggleSelectAllCategories() {
    if (allCategoriesSelected) {
      setSelectedCategoryIds([]);
    } else {
      setSelectedCategoryIds(categories.map(c => c.id));
    }
  }

  async function saveCategories() {
    if (!discount) return;

    setSaving(true);
    try {
      const body = {
        categoryIds: selectedCategoryIds,
      };

      const updated = await fetchJson<Discount>(
        `${API_BASE}/discounts/${discount.id}/targets`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );

      setDiscount(updated);
      if (Array.isArray(updated.categoryIds)) {
        setSelectedCategoryIds(updated.categoryIds);
      }
      setCategoriesOpen(false);
    } catch (err: any) {
      console.error('Save categories error', err);
      alert(`Failed to save categories: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  /* ----------------------------- products (product + size) modal --------------------------- */

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return products.filter(
      p =>
        p.isActive !== false &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.code && p.code.toLowerCase().includes(q))),
    );
  }, [products, productSearch]);

  const allProductsSelected =
    products.length > 0 &&
    selectedProductIds.length === products.length;

  function toggleProduct(id: string) {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  async function openProductsModal() {
    setProductsOpen(true);
    if (products.length > 0) return;

    setProductsLoading(true);
    try {
      // flatSizes=1 → backend returns "Product - Size" rows (id = ProductSize.id)
      const data = await fetchJson<Product[]>(
        `${API_BASE}/menu/products?flatSizes=1&includeInactive=false`,
      );
      setProducts(data.filter(p => p.isActive !== false));
    } catch (err) {
      console.error('Load products error', err);
      alert('Failed to load products.');
    } finally {
      setProductsLoading(false);
    }
  }

  function toggleSelectAllProducts() {
    if (allProductsSelected) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(products.map(p => p.id));
    }
  }

  async function saveProducts() {
    if (!discount) return;

    setSaving(true);
    try {
      const body = {
        // ✅ send as productSizeIds because IDs are ProductSize.id
        productSizeIds: selectedProductIds,
      };

      const updated = await fetchJson<Discount>(
        `${API_BASE}/discounts/${discount.id}/targets`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );

      setDiscount(updated);

      // hydrate from updated response (prefer productSizeIds)
      if (
        Array.isArray(updated.productSizeIds) &&
        updated.productSizeIds.length
      ) {
        setSelectedProductIds(updated.productSizeIds);
      } else if (Array.isArray(updated.productIds) && updated.productIds.length) {
        setSelectedProductIds(updated.productIds);
      }

      setProductsOpen(false);
    } catch (err: any) {
      console.error('Save products error', err);
      alert(`Failed to save products: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------- summary text for targets ---------------------- */

  const branchesSummaryText = useMemo(() => {
    if (discount?.applyAllBranches) {
      return 'Automatically applied on all existing and new branches.';
    }
    if (selectedBranchIds.length > 0) {
      return `Applies on ${selectedBranchIds.length} selected branch${
        selectedBranchIds.length > 1 ? 'es' : ''
      }.`;
    }
    return 'Select the branches where this discount can be applied.';
  }, [discount?.applyAllBranches, selectedBranchIds.length]);

  const categoriesSummaryText = useMemo(() => {
    if (selectedCategoryIds.length > 0) {
      return `Applies on ${selectedCategoryIds.length} selected categor${
        selectedCategoryIds.length > 1 ? 'ies' : 'y'
      }.`;
    }
    return 'Select the menu categories where this discount can be applied.';
  }, [selectedCategoryIds.length]);

  const productsSummaryText = useMemo(() => {
    if (selectedProductIds.length > 0) {
      return `Applies on ${selectedProductIds.length} selected product size${
        selectedProductIds.length > 1 ? 's' : ''
      }.`;
    }
    return 'Select the menu product sizes where this discount can be applied.';
  }, [selectedProductIds.length]);

  /* ----------------------------- render ----------------------------- */

  return (
    <div className="space-y-6">
      {/* Top row: Back + Edit */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <span className="inline-block rounded-full border border-slate-300 px-2 py-1 text-[10px]">
            &lt; Back
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex h-8 items-center rounded-full border border-red-200 bg-white px-4 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete Discount'}
          </button>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex h-8 items-center rounded-full bg-black px-4 text-xs font-semibold text-white hover:bg-black/90"
          >
            Edit Discount
          </button>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

      {/* Summary card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Name</div>
            <div className="font-medium text-slate-900">
              {discount?.name ?? '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Name Localized</div>
            <div className="font-medium text-slate-900">
              {discount?.nameLocalized || '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Qualification</div>
            <div className="font-medium text-slate-900">
              {discount ? qualificationLabel(discount.qualification) : '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Discount Amount</div>
            <div className="font-medium text-slate-900">
              {discount ? formatDiscountAmount(discount) : '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Minimum Product Price</div>
            <div className="font-medium text-slate-900">
              {discount?.minProductPrice != null
                ? discount.minProductPrice
                : '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Maximum Discount</div>
            <div className="font-medium text-slate-900">
              {discount?.maxDiscount != null ? discount.maxDiscount : '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Reference</div>
            <div className="font-medium text-slate-900">
              {discount?.reference || '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="text-slate-500">Taxable</div>
            <div className="font-medium text-slate-900">
              {discount ? (discount.taxable ? 'Yes' : 'No') : '—'}
            </div>
          </div>

          <div className="space-y-1 text-xs sm:col-span-2">
            <div className="text-slate-500">Applies On Order Types</div>
            <div className="flex flex-wrap gap-2">
              {parseOrderTypes(discount?.orderTypes).length === 0 && (
                <span className="text-slate-400">—</span>
              )}
              {parseOrderTypes(discount?.orderTypes).map(t => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700"
                >
                  {orderTypeLabel(t)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Applies on branches */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-800">
            Applies On Branches
          </h2>
          <button
            type="button"
            onClick={openBranchesModal}
            className="inline-flex h-7 items-center rounded-full bg-black px-3 text-[11px] font-medium text-white hover:bg-black/90"
          >
            Edit Branches
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <p>{branchesSummaryText}</p>
        </div>
      </section>

      {/* Applies on categories */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-800">
            Applies On Categories
          </h2>
          <button
            type="button"
            onClick={openCategoriesModal}
            className="inline-flex h-7 items-center rounded-full bg-black px-3 text-[11px] font-medium text-white hover:bg-black/90"
          >
            Add Categories
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <p>{categoriesSummaryText}</p>
        </div>
      </section>

      {/* Applies on product sizes */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-800">
            Applies On Product Sizes
          </h2>
          <button
            type="button"
            onClick={openProductsModal}
            className="inline-flex h-7 items-center rounded-full bg-black px-3 text-[11px] font-medium text-white hover:bg-black/90"
          >
            Add Product Sizes
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <p>{productsSummaryText}</p>
        </div>
      </section>

      {loading && (
        <div className="text-[11px] text-slate-400">Loading…</div>
      )}

      {/* ----------------------------- Edit Discount Modal ----------------------------- */}
      {editOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Edit Discount
              </h2>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100"
                onClick={() => setEditOpen(false)}
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEdit}
              className="space-y-3 px-4 py-4 text-xs"
            >
              {/* Name */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Name Localized */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Name Localized
                </label>
                <input
                  type="text"
                  value={editNameLocalized}
                  onChange={e => setEditNameLocalized(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Discount Type */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Discount Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={editType}
                  onChange={e =>
                    setEditType(e.target.value as DiscountType)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed</option>
                </select>
              </div>

              {/* Discount Amount */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Discount Amount
                  {editType === 'PERCENTAGE' ? ' (%)' : ''}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Maximum Discount */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Maximum Discount
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editMaxDiscount}
                  onChange={e => setEditMaxDiscount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Minimum Product Price */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Minimum Product Price
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editMinPrice}
                  onChange={e => setEditMinPrice(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* Qualification */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Qualification
                </label>
                <select
                  value={editQualification}
                  onChange={e =>
                    setEditQualification(
                      e.target.value as DiscountQualification,
                    )
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                >
                  <option value="PRODUCT">Product</option>
                  <option value="ORDER">Order</option>
                  <option value="ORDER_AND_PRODUCT">Order &amp; Product</option>
                </select>
              </div>

              {/* Order types */}
              <div className="space-y-1">
                <label className="block font-medium text-slate-700">
                  Applies On Order Types
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ORDER_TYPES.map(o => {
                    const active = editOrderTypes.includes(o);
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => toggleOrderType(o)}
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${
                          active
                            ? 'border-black bg-black text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {orderTypeLabel(o)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Taxable */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="edit-taxable"
                  type="checkbox"
                  checked={editTaxable}
                  onChange={e => setEditTaxable(e.target.checked)}
                  className="h-3 w-3 rounded border-slate-300"
                />
                <label
                  htmlFor="edit-taxable"
                  className="text-xs text-slate-700"
                >
                  Taxable
                </label>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex h-8 items-center rounded-full border border-red-200 bg-white px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete Discount
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-8 items-center rounded-lg bg-black px-4 text-xs font-semibold text-white hover:bg-black/90 disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------- Branches Modal ----------------------------- */}
      {branchesOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Applies On Branches
              </h2>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100"
                onClick={() => setBranchesOpen(false)}
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4 text-xs">
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="branchMode"
                    checked={applyAllBranches}
                    onChange={() => setApplyAllBranches(true)}
                    className="h-3 w-3"
                  />
                  <span>
                    Automatically apply on all existing and new branches
                  </span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="branchMode"
                    checked={!applyAllBranches}
                    onChange={() => setApplyAllBranches(false)}
                    className="h-3 w-3"
                  />
                  <span>Branches</span>
                </label>
              </div>

              {!applyAllBranches && (
                <>
                  <input
                    type="text"
                    placeholder="Type something to start searching"
                    value={branchSearch}
                    onChange={e => setBranchSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                  />
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200">
                    {branchesLoading && (
                      <div className="px-3 py-2 text-[11px] text-slate-400">
                        Loading branches…
                      </div>
                    )}
                    {!branchesLoading &&
                      filteredBranches.map(b => {
                        const selected = selectedBranchIds.includes(b.id);
                        const label =
                          (b.name || '') +
                          (b.reference || b.code
                            ? ` (${b.reference || b.code})`
                            : '');
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => toggleBranch(b.id)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11px] ${
                              selected
                                ? 'bg-black text-white'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <span>{label}</span>
                            {selected && (
                              <span className="text-[10px]">Selected</span>
                            )}
                          </button>
                        );
                      })}
                    {!branchesLoading && filteredBranches.length === 0 && (
                      <div className="px-3 py-2 text-[11px] text-slate-400">
                        No branches found.
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBranchesOpen(false)}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveBranches}
                  disabled={saving}
                  className="inline-flex h-8 items-center rounded-lg bg-black px-4 text-xs font-semibold text-white hover:bg-black/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------- Categories Modal ----------------------------- */}
      {categoriesOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Edit Categories
              </h2>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100"
                onClick={() => setCategoriesOpen(false)}
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4 text-xs">
              <button
                type="button"
                onClick={toggleSelectAllCategories}
                className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {allCategoriesSelected ? 'Deselect All' : 'Select All'}
              </button>

              <input
                type="text"
                placeholder="Type something to start searching"
                value={categorySearch}
                onChange={e => setCategorySearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
              />

              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200">
                {categoriesLoading && (
                  <div className="px-3 py-2 text-[11px] text-slate-400">
                    Loading categories…
                  </div>
                )}
                {!categoriesLoading &&
                  filteredCategories.map(c => {
                    const selected = selectedCategoryIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategory(c.id)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11px] ${
                          selected ? 'bg-black text-white' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span>{c.name}</span>
                        {selected && (
                          <span className="text-[10px]">Selected</span>
                        )}
                      </button>
                    );
                  })}
                {!categoriesLoading && filteredCategories.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-slate-400">
                    No categories found.
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCategoriesOpen(false)}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveCategories}
                  disabled={saving}
                  className="inline-flex h-8 items-center rounded-lg bg-black px-4 text-xs font-semibold text-white hover:bg-black/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------- Products Modal (product + size) ----------------------------- */}
      {productsOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Edit Product Sizes
              </h2>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100"
                onClick={() => setProductsOpen(false)}
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4 text-xs">
              <button
                type="button"
                onClick={toggleSelectAllProducts}
                className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {allProductsSelected ? 'Deselect All' : 'Select All'}
              </button>

              <input
                type="text"
                placeholder="Type something to start searching"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
              />

              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200">
                {productsLoading && (
                  <div className="px-3 py-2 text-[11px] text-slate-400">
                    Loading products…
                  </div>
                )}
                {!productsLoading &&
                  filteredProducts.map(p => {
                    const selected = selectedProductIds.includes(p.id);
                    const label = p.name + (p.code ? ` (${p.code})` : '');
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProduct(p.id)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11px] ${
                          selected ? 'bg-black text-white' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span>{label}</span>
                        {selected && (
                          <span className="text-[10px]">Selected</span>
                        )}
                      </button>
                    );
                  })}
                {!productsLoading && filteredProducts.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-slate-400">
                    No products found.
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProductsOpen(false)}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveProducts}
                  disabled={saving}
                  className="inline-flex h-8 items-center rounded-lg bg-black px-4 text-xs font-semibold text-white hover:bg-black/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
