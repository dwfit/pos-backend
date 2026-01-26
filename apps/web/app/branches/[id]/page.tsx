"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Brand = { id: string; code: string; name: string; isActive?: boolean };

type Branch = {
  id: string;
  brandId?: string | null;

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

  // dropdown data
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandsError, setBrandsError] = useState<string | null>(null);

  const [taxGroups, setTaxGroups] = useState<string[]>([]);
  const [taxGroupsLoading, setTaxGroupsLoading] = useState(false);

  const [form, setForm] = useState<Payload>({
    brandId: "",

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

  /* ----------------------------- helpers ----------------------------- */

  function getToken() {
    if (typeof window === "undefined") return "";
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("pos_token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("access_token") ||
      ""
    );
  }

  const set = (k: keyof Payload, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const emptyToNull = (v: any) => (v === "" ? null : v);

  async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const token = getToken();

    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      credentials: "include",
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Request failed: ${res.status}`);
    }
    return data as T;
  }

  /* ----------------------------- Load Brands ----------------------------- */
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setBrandsLoading(true);
        setBrandsError(null);

        // keep same behavior as your list page: simple + active
        const token = getToken();
        const res = await fetch(`${base}/brands?simple=1&active=1`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const text = await res.text().catch(() => "");
        if (!res.ok) throw new Error(`GET /brands failed: ${res.status} ${text}`);

        const j = text ? JSON.parse(text) : null;
        const items: Brand[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];

        if (!abort) setBrands(items);
      } catch (e: any) {
        console.warn("Failed to load brands", e);
        if (!abort) {
          setBrands([]);
          setBrandsError(e?.message || "Failed to load brands");
        }
      } finally {
        if (!abort) setBrandsLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [base]);

  /* ----------------------------- Load Tax Groups (AUTH) ----------------------------- */
useEffect(() => {
  let abort = false;

  (async () => {
    try {
      setTaxGroupsLoading(true);

      // reset
      setTaxGroups([]);

      // ✅ fetch
      const raw = await fetchJson<any>(`${base}/branches/tax-groups`);

      // ✅ support multiple response shapes
      const list: string[] =
        Array.isArray(raw) ? raw :
        Array.isArray(raw?.data) ? raw.data :
        Array.isArray(raw?.taxGroups) ? raw.taxGroups :
        Array.isArray(raw?.items) ? raw.items :
        [];

      if (!abort) {
        setTaxGroups(list.filter(Boolean));
      }
    } catch (e: any) {
      console.warn("Failed to load tax groups", e);

      // ✅ IMPORTANT: show the reason (401, 403, wrong route, etc.)
      if (!abort) {
        setTaxGroups([]);
        setError(`Tax groups load failed: ${e?.message || "Unknown error"}`);
      }
    } finally {
      if (!abort) setTaxGroupsLoading(false);
    }
  })();

  return () => {
    abort = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [base]);


  /* ----------------------------- Load existing branch (AUTH) ----------------------------- */
  useEffect(() => {
    let abort = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const j = await fetchJson<any>(showUrl);
        const b: Branch = j?.branch ?? j?.data;

        if (!b) {
          setError("Invalid response from server");
          return;
        }

        if (!abort) {
          setForm({
            brandId: b.brandId ?? "",

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
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "Failed to load");
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUrl]);

  /* ----------------------------- Save (PATCH -> PUT fallback) ----------------------------- */
  const save = async () => {
    if (!form.brandId) return alert("Brand is required");
    if (!form.name?.trim()) return alert("Name is required");

    const body = {
      // ✅ brandId saved to DB
      brandId: emptyToNull(form.brandId),

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

    setSaving(true);
    try {
      let res = await fetch(`${updateUrl}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.status === 405) {
        res = await fetch(`${updateUrl}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify(body),
        });
      }

      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        const serverMsg =
          j?.error || j?.message || j?.details || j?.meta?.cause || `HTTP ${res.status}`;
        alert(`Failed to update branch: ${serverMsg}`);
        console.error("Update failed:", { status: res.status, response: j, body });
        return;
      }

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
          <Link href="/branches" className="text-sm text-gray-500 hover:underline">
            ← Back
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
            {/* ✅ Brand */}
            <Field label="Brand" required>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.brandId || ""}
                onChange={(e) => set("brandId", e.target.value)}
                disabled={brandsLoading}
              >
                <option value="">Choose…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {brandsError ? <div className="text-xs text-red-600 mt-1">{brandsError}</div> : null}
            </Field>

            <Field label="Name" required>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>

            <Field label="Name Localized">
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.nameLocalized || ""}
                onChange={(e) => set("nameLocalized", e.target.value)}
              />
            </Field>

            <Field label="Reference">
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.reference || ""}
                onChange={(e) => set("reference", e.target.value)}
              />
            </Field>

            <Field label="Code">
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.code || ""}
                onChange={(e) => set("code", e.target.value)}
              />
            </Field>

            <Field label="Tax Group">
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.taxGroup ?? ""}
                onChange={(e) => set("taxGroup", e.target.value)}
                disabled={taxGroupsLoading}
              >
                <option value="">Choose…</option>
                {!taxGroupsLoading &&
                  taxGroups.map((tg) => (
                    <option key={tg} value={tg}>
                      {tg}
                    </option>
                  ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Opening From">
                <input
                  type="time"
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.openingFrom || ""}
                  onChange={(e) => set("openingFrom", e.target.value)}
                />
              </Field>
              <Field label="Opening To">
                <input
                  type="time"
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.openingTo || ""}
                  onChange={(e) => set("openingTo", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Inventory End of Day">
              <input
                type="time"
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.inventoryEndOfDay || ""}
                onChange={(e) => set("inventoryEndOfDay", e.target.value)}
              />
            </Field>

            <Field label="Branch Tax Registration Name">
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.branchTaxRegistrationName || ""}
                onChange={(e) => set("branchTaxRegistrationName", e.target.value)}
              />
            </Field>

            <Field label="Branch Tax Number">
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.branchTaxNumber || ""}
                onChange={(e) => set("branchTaxNumber", e.target.value)}
              />
            </Field>
          </div>

          {/* Column B */}
          <div className="space-y-3">
            <Field label="Phone">
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.phone || ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>

            <Field label="Address">
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                rows={2}
                value={form.address || ""}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Street Name">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.streetName || ""}
                  onChange={(e) => set("streetName", e.target.value)}
                />
              </Field>
              <Field label="Building Number">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.buildingNumber || ""}
                  onChange={(e) => set("buildingNumber", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Additional Number">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.additionalNumber || ""}
                  onChange={(e) => set("additionalNumber", e.target.value)}
                />
              </Field>
              <Field label="City">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.city || ""}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="District">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.district || ""}
                  onChange={(e) => set("district", e.target.value)}
                />
              </Field>
              <Field label="Postal Code">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.postalCode || ""}
                  onChange={(e) => set("postalCode", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="CR Number">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.crNumber || ""}
                  onChange={(e) => set("crNumber", e.target.value)}
                />
              </Field>
              <Field label="Latitude">
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                  value={form.latitude || ""}
                  onChange={(e) => set("latitude", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Longitude">
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                value={form.longitude || ""}
                onChange={(e) => set("longitude", e.target.value)}
              />
            </Field>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.displayApp}
                onChange={(e) => set("displayApp", e.target.checked)}
              />
              Display App
            </label>

            <Field label="Receipt Header">
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                rows={2}
                value={form.receiptHeader || ""}
                onChange={(e) => set("receiptHeader", e.target.value)}
              />
            </Field>

            <Field label="Receipt Footer">
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 bg-white dark:bg-neutral-950"
                rows={2}
                value={form.receiptFooter || ""}
                onChange={(e) => set("receiptFooter", e.target.value)}
              />
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
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
      {children}
    </label>
  );
}
