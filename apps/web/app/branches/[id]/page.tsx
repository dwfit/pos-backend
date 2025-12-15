"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";


type Branch = {
  id: string;
  code?: string | null;
  name: string;
  nameLocalized?: string | null;
  reference?: string | null;
  taxGroup?: string | null;

  branchTaxRegistrationName?: string | null;
  branchTaxNumber?: string | null;

  openingFrom?: string | null;
  openingTo?: string | null;
  inventoryEndOfDay?: string | null;

  phone?: string | null;
  address?: string | null;

  streetName?: string | null;
  buildingNumber?: string | null;
  additionalNumber?: string | null;
  city?: string | null;
  district?: string | null;
  postalCode?: string | null;
  crNumber?: string | null;
  latitude?: string | null;
  longitude?: string | null;

  displayApp?: boolean | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
};

type Payload = Omit<Branch, "id"> & { name: string };

export default function EditBranchPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const base = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const showUrl = `${base}/branches/${params.id}`;
  const updateUrl = `${base}/branches/${params.id}`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Payload>({
    name: "",
    nameLocalized: "",
    reference: "",
    code: "",
    taxGroup: "",

    branchTaxRegistrationName: "",
    branchTaxNumber: "",

    openingFrom: "",
    openingTo: "",
    inventoryEndOfDay: "",

    phone: "",
    address: "",

    streetName: "",
    buildingNumber: "",
    additionalNumber: "",
    city: "",
    district: "",
    postalCode: "",
    crNumber: "",
    latitude: "",
    longitude: "",

    displayApp: false,
    receiptHeader: "",
    receiptFooter: "",
  });

  // helpers
  const set = (k: keyof Payload, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const emptyToNull = (v: any) =>
    v === "" ? null : v;

  // load existing
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(showUrl, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(j?.error || `HTTP ${res.status}`);
          return;
        }
        const b: Branch = j?.branch ?? j?.data;
        if (!b) {
          setError("Invalid response from server");
          return;
        }
        setForm({
          name: b.name ?? "",
          nameLocalized: b.nameLocalized ?? "",
          reference: b.reference ?? "",
          code: b.code ?? "",
          taxGroup: b.taxGroup ?? "",

          branchTaxRegistrationName: b.branchTaxRegistrationName ?? "",
          branchTaxNumber: b.branchTaxNumber ?? "",

          openingFrom: b.openingFrom ?? "",
          openingTo: b.openingTo ?? "",
          inventoryEndOfDay: b.inventoryEndOfDay ?? "",

          phone: b.phone ?? "",
          address: b.address ?? "",

          streetName: b.streetName ?? "",
          buildingNumber: b.buildingNumber ?? "",
          additionalNumber: b.additionalNumber ?? "",
          city: b.city ?? "",
          district: b.district ?? "",
          postalCode: b.postalCode ?? "",
          crNumber: b.crNumber ?? "",
          latitude: b.latitude ?? "",
          longitude: b.longitude ?? "",

          displayApp: !!b.displayApp,
          receiptHeader: b.receiptHeader ?? "",
          receiptFooter: b.receiptFooter ?? "",
        });
      } catch (e: any) {
        setError(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [showUrl]);

  const save = async () => {
    if (!form.name?.trim()) return alert("Name is required");
  
    // 1) Normalize payload (empty strings -> null)
    const emptyToNull = (v: any) => (v === "" ? null : v);
    const body = {
      name: form.name.trim(),
      nameLocalized: emptyToNull(form.nameLocalized),
      reference: emptyToNull(form.reference),
      code: emptyToNull(form.code),
      taxGroup: emptyToNull(form.taxGroup),
  
      branchTaxRegistrationName: emptyToNull(form.branchTaxRegistrationName),
      branchTaxNumber: emptyToNull(form.branchTaxNumber),
  
      openingFrom: emptyToNull(form.openingFrom),
      openingTo: emptyToNull(form.openingTo),
      inventoryEndOfDay: emptyToNull(form.inventoryEndOfDay),
  
      phone: emptyToNull(form.phone),
      address: emptyToNull(form.address),
  
      streetName: emptyToNull(form.streetName),
      buildingNumber: emptyToNull(form.buildingNumber),
      additionalNumber: emptyToNull(form.additionalNumber),
      city: emptyToNull(form.city),
      district: emptyToNull(form.district),
      postalCode: emptyToNull(form.postalCode),
      crNumber: emptyToNull(form.crNumber),
      latitude: emptyToNull(form.latitude),
      longitude: emptyToNull(form.longitude),
  
      displayApp: !!form.displayApp,
      receiptHeader: emptyToNull(form.receiptHeader),
      receiptFooter: emptyToNull(form.receiptFooter),
    };
  
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null; // 2) auth header (your API uses requireAuth)
  
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
  
    setSaving(true);
    try {
      // 3) Try PATCH first
      let res = await fetch(updateUrl, { method: "PATCH", headers, body: JSON.stringify(body) });
  
      // 4) If PATCH isn’t allowed on the server, auto-fallback to PUT
      if (res.status === 405) {
        res = await fetch(updateUrl, { method: "PUT", headers, body: JSON.stringify(body) });
      }
  
      // Read JSON once and show the real server error if present
      const j = await res.json().catch(() => ({}));
  
      if (!res.ok) {
        // surface common Prisma/validation errors
        const serverMsg =
          j?.error || j?.message || j?.details || j?.meta?.cause || `HTTP ${res.status}`;
        alert(`Failed to update branch: ${serverMsg}`);
        console.error("Update failed:", { status: res.status, response: j, body });
        return;
      }
  
      const id = j?.data?.id ?? j?.branch?.id ?? params.id;
      router.push("/branches");
    } catch (e: any) {
      alert(`Failed to update: ${e?.message || "network error"}`);
      console.error("Update exception:", e);
    } finally {
      setSaving(false);
    }
  };
  

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/branches"
            className="text-sm text-gray-500 hover:underline"
          >← Back
          </Link>
          <h1 className="text-xl font-semibold">Edit Branch</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-md border"
            onClick={() => router.push(`/branches/${params.id}`)}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-md bg-black text-white hover:bg-neutral-800 disabled:opacity-60"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow border border-neutral-200 dark:border-neutral-800 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Column A */}
          <div className="space-y-3">
            <Field label="Name" required>
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.name} onChange={e => set("name", e.target.value)} />
            </Field>

            <Field label="Name Localized">
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.nameLocalized || ""} onChange={e => set("nameLocalized", e.target.value)} />
            </Field>

            <Field label="Reference">
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.reference || ""} onChange={e => set("reference", e.target.value)} />
            </Field>

            <Field label="Code">
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.code || ""} onChange={e => set("code", e.target.value)} />
            </Field>

            <Field label="Tax Group">
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.taxGroup ?? ""} onChange={e => set("taxGroup", e.target.value)}
              >
                <option value="">Choose…</option>
                <option value="VAT Tax Group">VAT Tax Group</option>
                <option value="All taxes group">All taxes group</option>
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Opening From">
                <input type="time" className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.openingFrom || ""} onChange={e => set("openingFrom", e.target.value)} />
              </Field>
              <Field label="Opening To">
                <input type="time" className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.openingTo || ""} onChange={e => set("openingTo", e.target.value)} />
              </Field>
            </div>

            <Field label="Inventory End of Day">
              <input type="time" className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.inventoryEndOfDay || ""} onChange={e => set("inventoryEndOfDay", e.target.value)} />
            </Field>

            <Field label="Branch Tax Registration Name">
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.branchTaxRegistrationName || ""} onChange={e => set("branchTaxRegistrationName", e.target.value)} />
            </Field>

            <Field label="Branch Tax Number">
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.branchTaxNumber || ""} onChange={e => set("branchTaxNumber", e.target.value)} />
            </Field>
          </div>

          {/* Column B */}
          <div className="space-y-3">
            <Field label="Phone">
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.phone || ""} onChange={e => set("phone", e.target.value)} />
            </Field>

            <Field label="Address">
              <textarea className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950" rows={2}
                value={form.address || ""} onChange={e => set("address", e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Street Name">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.streetName || ""} onChange={e => set("streetName", e.target.value)} />
              </Field>
              <Field label="Building Number">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.buildingNumber || ""} onChange={e => set("buildingNumber", e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Additional Number">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.additionalNumber || ""} onChange={e => set("additionalNumber", e.target.value)} />
              </Field>
              <Field label="City">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.city || ""} onChange={e => set("city", e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="District">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.district || ""} onChange={e => set("district", e.target.value)} />
              </Field>
              <Field label="Postal Code">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.postalCode || ""} onChange={e => set("postalCode", e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="CR Number">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.crNumber || ""} onChange={e => set("crNumber", e.target.value)} />
              </Field>
              <Field label="Latitude">
                <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.latitude || ""} onChange={e => set("latitude", e.target.value)} />
              </Field>
            </div>

            <Field label="Longitude">
              <input className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.longitude || ""} onChange={e => set("longitude", e.target.value)} />
            </Field>

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.displayApp} onChange={e => set("displayApp", e.target.checked)} />
              Display App
            </label>

            <Field label="Receipt Header">
              <textarea className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950" rows={2}
                value={form.receiptHeader || ""} onChange={e => set("receiptHeader", e.target.value)} />
            </Field>

            <Field label="Receipt Footer">
              <textarea className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950" rows={2}
                value={form.receiptFooter || ""} onChange={e => set("receiptFooter", e.target.value)} />
            </Field>
          </div>

        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}{required ? <span className="text-red-500"> *</span> : null}
      {children}
    </label>
  );
}
