'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Category = { id: string; name: string };
type SizeRow = { name: string; price: string; code?: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function ProductCreateCard() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [sizes, setSizes] = useState<SizeRow[]>([{ name: '', price: '' }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // load categories once
  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/menu/categories`);
      const data = await res.json();
      setCategories(data || []);
      if (data?.length && !categoryId) setCategoryId(data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f || null);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function updateSize(idx: number, key: keyof SizeRow, val: string) {
    setSizes((prev) => {
      const cp = [...prev];
      cp[idx] = { ...cp[idx], [key]: val };
      return cp;
    });
  }

  function addSize() {
    setSizes((prev) => [...prev, { name: '', price: '' }]);
  }

  function removeSize(idx: number) {
    setSizes((prev) => prev.filter((_, i) => i !== idx));
  }

  const sizesForSubmit = useMemo(() => {
    return sizes
      .map((s) => ({
        name: s.name.trim(),
        price: Number(s.price || 0),
        code: s.code?.trim() || undefined,
      }))
      .filter((s) => s.name && Number.isFinite(s.price) && s.price >= 0);
  }, [sizes]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert('Product name is required');
    if (!categoryId) return alert('Please choose a category');

    const fd = new FormData();
    if (sku.trim()) fd.set('sku', sku.trim());
    fd.set('name', name.trim());
    fd.set('categoryId', categoryId);
    fd.set('sizes', JSON.stringify(sizesForSubmit));
    if (imageFile) fd.set('image', imageFile);

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/menu/products`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to create product');
      }
      // reset
      setName('');
      setSku('');
      setSizes([{ name: '', price: '' }]);
      setImageFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      alert('Product created!');
    } catch (err: any) {
      alert(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">New Product</h3>
        <span className="text-xs text-slate-500">photo + sizes</span>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" encType="multipart/form-data">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Product name</label>
            <input
              type="text"
              className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
              placeholder="e.g., Classic Burger"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">SKU (optional)</label>
            <input
              type="text"
              className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
              placeholder="Auto if empty"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <select
              className="w-full rounded-xl border px-3 py-2 bg-white"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Photo</label>
            <div className="flex items-center gap-4">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickFile}
                className="block w-full text-sm"
              />
              {preview && (
                <img
                  src={preview}
                  alt="preview"
                  className="h-16 w-16 rounded-lg object-cover border"
                />
              )}
            </div>
            <p className="text-xs text-slate-500">
              JPEG/PNG, recommended square (e.g., 512×512).
            </p>
          </div>
        </div>

        {/* Sizes editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Sizes & Prices</label>
            <button
              type="button"
              onClick={addSize}
              className="text-sm rounded-lg border px-3 py-1.5 hover:bg-slate-50"
            >
              + Add size
            </button>
          </div>
          <div className="space-y-2">
            {sizes.map((s, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  className="col-span-5 rounded-xl border px-3 py-2"
                  placeholder="Size name (e.g., Regular)"
                  value={s.name}
                  onChange={(e) => updateSize(idx, 'name', e.target.value)}
                />
                <input
                  className="col-span-4 rounded-xl border px-3 py-2"
                  placeholder="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={s.price}
                  onChange={(e) => updateSize(idx, 'price', e.target.value)}
                />
                <input
                  className="col-span-2 rounded-xl border px-3 py-2"
                  placeholder="Code (opt.)"
                  value={s.code || ''}
                  onChange={(e) => updateSize(idx, 'code', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeSize(idx)}
                  className="col-span-1 rounded-lg border px-3 py-2 hover:bg-red-50"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Base price will be the minimum of the listed sizes.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
}
