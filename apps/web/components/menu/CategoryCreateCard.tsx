'use client';

import { useState, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function CategoryCreateCard() {
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f || null);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert('Category name is required');

    const fd = new FormData();
    fd.set('name', name.trim());
    if (imageFile) fd.set('image', imageFile);

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE}/menu/categories`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to create category');
      }
      // reset
      setName('');
      setImageFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      alert('Category created!');
    } catch (err: any) {
      alert(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">New Category</h3>
        <span className="text-xs text-slate-500">with photo</span>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" encType="multipart/form-data">
        <div className="space-y-2">
          <label className="text-sm font-medium">Category name</label>
          <input
            type="text"
            className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
            placeholder="e.g., Burgers"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
          <p className="text-xs text-slate-500">JPEG/PNG, recommended square (e.g., 512×512).</p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Category'}
          </button>
        </div>
      </form>
    </div>
  );
}
