"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authStore } from "@/lib/auth-store";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

/* ----------------------------- types ----------------------------- */

type Organization = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;

  // ERP fields
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  emailDomain?: string | null;
  color?: string | null;

  vatNumber?: string | null;
  licenseType?: string | null;
  licenseNo?: string | null;
  companyId?: string | null;
  currency?: string | null;

  addressLine1?: string | null;
  addressLine2?: string | null;
  buildingNumber?: string | null;
  additionalNumber?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;

  logoMediaId?: string | null;
  logoUrl?: string | null;
};

type Brand = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  organizationId: string;
  organization?: Organization;
  createdAt?: string;
};

/* ----------------------------- helpers ----------------------------- */

function getToken() {
  if (typeof window === "undefined") return "";
  try {
    // ✅ support all common keys used in your project
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("pos_token") ||
      ""
    );
  } catch {
    return "";
  }
}

async function api<T>(path: string, data?: any): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API}${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
    credentials: "include",
  });

  // ✅ central 401 handling
  if (res.status === 401) {
    authStore.expire("Session expired. Please log in again.");
    throw new Error("Unauthorized (401). Please login again.");
  }

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      (text ? text.slice(0, 280) : "") ||
      `HTTP ${res.status}`;
    throw new Error(`API ${res.status}: ${msg}`);
  }

  return (json ?? ({} as any)) as T;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ----------------------------- small UI atoms ----------------------------- */

function Pill({ active }: { active: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200"
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 disabled:cursor-not-allowed";

  // ✅ black buttons (primary + secondary)
  const styles =
    variant === "primary"
      ? "bg-black text-white hover:bg-zinc-900"
      : variant === "secondary"
      ? "bg-black text-white hover:bg-zinc-900"
      : variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-500"
      : "bg-transparent text-zinc-700 hover:bg-zinc-100";

  return (
    <button className={cx(base, styles, className)} {...props}>
      {children}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-zinc-600">{label}</div>
      <input
        type={type || "text"}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(
          "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none",
          "focus:border-zinc-300 focus:ring-2 focus:ring-zinc-900/10",
          disabled && "bg-zinc-50 text-zinc-500"
        )}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-zinc-600">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-900/10"
      >
        {children}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <div className="text-sm text-zinc-800">{label}</div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          checked ? "bg-black" : "bg-zinc-200"
        )}
        aria-label={label}
      >
        <span
          className={cx(
            "inline-block h-5 w-5 transform rounded-full bg-white transition",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

function Drawer({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={cx("fixed inset-0 z-50", open ? "" : "pointer-events-none")}>
      <div
        onClick={onClose}
        className={cx(
          "absolute inset-0 bg-black/30 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cx(
          "absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl transition-transform",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-zinc-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-zinc-900">{title}</div>
                {subtitle ? (
                  <div className="mt-1 text-sm text-zinc-600">{subtitle}</div>
                ) : null}
              </div>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      {desc ? <div className="mt-0.5 text-xs text-zinc-500">{desc}</div> : null}
    </div>
  );
}

/* ----------------------------- Logo upload ----------------------------- */

function LogoUploader({
  value,
  onUploaded,
}: {
  value?: string | null;
  onUploaded: (v: { logoMediaId: string; logoUrl: string }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleUpload(file: File) {
    try {
      setErr("");
      setUploading(true);

      const token = getToken();
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API}/organizations/media/logo`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
        credentials: "include",
      });

      if (res.status === 401) {
        authStore.expire("Session expired. Please log in again.");
        throw new Error("Unauthorized (401). Please login again.");
      }

      const text = await res.text().catch(() => "");
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        throw new Error(
          json?.message || json?.error || text || `HTTP ${res.status}`
        );
      }

      onUploaded({ logoMediaId: json.mediaId, logoUrl: json.url });
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const previewSrc =
    value && value.trim()
      ? value.startsWith("http")
        ? value
        : `${API}${value}` // ✅ fixes /uploads/... not loading from Next.js domain
      : "";

  return (
    <div className="flex items-center gap-4">
      <div className="h-20 w-20 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-center">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="Logo"
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-xs text-zinc-400">LOGO</span>
        )}
      </div>

      <div className="space-y-1">
        <label className="inline-flex cursor-pointer">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) =>
              e.target.files && e.target.files[0] && handleUpload(e.target.files[0])
            }
          />
          <span className="inline-flex items-center rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-zinc-900">
            {uploading ? "Uploading…" : "Upload Logo"}
          </span>
        </label>

        {err ? (
          <div className="text-xs text-rose-600">{err}</div>
        ) : (
          <div className="text-xs text-zinc-500">PNG/JPG up to 5MB.</div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- page ----------------------------- */

type TabKey = "org" | "brand";

export default function GeneralSettingsPage() {
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("org");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  const [q, setQ] = useState("");

  const [orgDrawer, setOrgDrawer] = useState<{ open: boolean; item?: Organization }>({
    open: false,
  });
  const [brandDrawer, setBrandDrawer] = useState<{ open: boolean; item?: Brand }>({
    open: false,
  });

  // ✅ orgDraft extended with ERP fields + logo
  const [orgDraft, setOrgDraft] = useState<Organization>({
    id: "",
    code: "",
    name: "",
    isActive: true,
    currency: "SAR",
    country: "Saudi Arabia",
  });

  const [brandDraft, setBrandDraft] = useState<{
    id?: string;
    organizationId: string;
    code: string;
    name: string;
    isActive: boolean;
  }>({
    organizationId: "",
    code: "",
    name: "",
    isActive: true,
  });

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    try {
      setErr("");
      setLoading(true);

      const [o, b] = await Promise.all([
        api<Organization[]>("/organizations"),
        api<Brand[]>("/brands"),
      ]);

      setOrgs(o);
      setBrands(b);
    } catch (e: any) {
      setErr(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  const orgCount = orgs.length;
  const brandCount = brands.length;

  const filteredOrgs = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orgs;
    return orgs.filter(
      (x) =>
        (x.name || "").toLowerCase().includes(s) ||
        (x.code || "").toLowerCase().includes(s)
    );
  }, [orgs, q]);

  const filteredBrands = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return brands;
    return brands.filter((x) => {
      const orgName = (x.organization?.name || "").toLowerCase();
      return (
        x.name.toLowerCase().includes(s) ||
        x.code.toLowerCase().includes(s) ||
        orgName.includes(s)
      );
    });
  }, [brands, q]);

  function openNewOrg() {
    setOrgDraft({
      id: "",
      code: "",
      name: "",
      isActive: true,
      currency: "SAR",
      country: "Saudi Arabia",
      color: "#000000",
      emailDomain: "",
    });
    setOrgDrawer({ open: true, item: undefined });
  }

  function openEditOrg(item: Organization) {
    setOrgDraft({
      ...item,
      currency: item.currency || "SAR",
      country: item.country || "Saudi Arabia",
      color: item.color || "#000000",
    });
    setOrgDrawer({ open: true, item });
  }

  function openNewBrand() {
    setBrandDraft({
      organizationId: orgs[0]?.id || "",
      code: "",
      name: "",
      isActive: true,
    });
    setBrandDrawer({ open: true, item: undefined });
  }

  function openEditBrand(item: Brand) {
    setBrandDraft({
      id: item.id,
      organizationId: item.organizationId,
      code: item.code || "",
      name: item.name || "",
      isActive: !!item.isActive,
    });
    setBrandDrawer({ open: true, item });
  }

  async function saveOrg() {
    try {
      setErr("");
      setLoading(true);

      const payload: any = { ...orgDraft };
      if (!payload.id) delete payload.id;

      await api("/organizations", payload);
      setOrgDrawer({ open: false, item: undefined });
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Failed to save organization");
      setLoading(false);
    }
  }

  async function saveBrand() {
    try {
      setErr("");
      setLoading(true);

      await api("/brands", brandDraft);
      setBrandDrawer({ open: false, item: undefined });
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Failed to save brand");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Top bar */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              General <span className="mx-1">/</span> Settings
            </div>

            <Button variant="secondary" onClick={() => router.back()}>
              Back
            </Button>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">
                Company & Brand Settings
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                Manage Organization (Company Profile) and Brands. Brands will own
                catalog data, while branches and devices belong under a brand.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={loadAll} disabled={loading}>
                Refresh
              </Button>
              {tab === "org" ? (
                <Button onClick={openNewOrg}>New Organization</Button>
              ) : (
                <Button onClick={openNewBrand} disabled={!orgs.length}>
                  New Brand
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {err ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {err}
          </div>
        ) : null}

        {/* Summary cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium text-zinc-500">Organizations</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-3xl font-semibold text-zinc-900">{orgCount}</div>
              <div className="text-sm text-zinc-600">Parent companies</div>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-medium text-zinc-500">Brands</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-3xl font-semibold text-zinc-900">{brandCount}</div>
              <div className="text-sm text-zinc-600">Child business units</div>
            </div>
          </div>
        </div>

        {/* Main card */}
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {/* tabs + search */}
          <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex rounded-xl bg-zinc-100 p-1">
              <button
                onClick={() => setTab("org")}
                className={cx(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  tab === "org"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-800"
                )}
              >
                Organizations
              </button>
              <button
                onClick={() => setTab("brand")}
                className={cx(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  tab === "brand"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-800"
                )}
              >
                Brands
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-full md:w-80">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by name, code, organization…"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
            </div>
          </div>

          {/* table */}
          <div className="overflow-x-auto">
            {tab === "org" ? (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.map((o) => (
                    <tr
                      key={o.id}
                      className="border-t border-zinc-100 hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden flex items-center justify-center">
                            {(() => {
                              const src =
                                o.logoUrl && o.logoUrl.trim()
                                  ? o.logoUrl.startsWith("http")
                                    ? o.logoUrl
                                    : `${API}${o.logoUrl}`
                                  : "";

                              return src ? (
                                <img
                                  src={src}
                                  className="h-full w-full object-contain"
                                  alt="logo"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display =
                                      "none";
                                  }}
                                />
                              ) : (
                                <span className="text-[10px] text-zinc-400">
                                  LOGO
                                </span>
                              );
                            })()}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-900">
                              {o.name}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {o.email || o.phone || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                        {o.code}
                      </td>
                      <td className="px-4 py-3">
                        <Pill active={!!o.isActive} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" onClick={() => openEditOrg(o)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredOrgs.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-sm text-zinc-500"
                        colSpan={4}
                      >
                        No organizations found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBrands.map((b) => (
                    <tr
                      key={b.id}
                      className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                      onClick={() => router.push(`/general/brands/${b.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">{b.name}</div>
                        <div className="text-xs text-zinc-500">ID: {b.id}</div>
                      </td>

                      <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                        {b.code}
                      </td>

                      <td className="px-4 py-3 text-zinc-800">
                        {b.organization?.name || (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Pill active={!!b.isActive} />
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/general/brands/${b.id}`);
                          }}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {!loading && filteredBrands.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-sm text-zinc-500"
                        colSpan={5}
                      >
                        No brands found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-200 p-4 text-xs text-zinc-500">
            <div>{loading ? "Loading…" : "Ready"}</div>
          </div>
        </div>
      </div>

      {/* Organization drawer */}
      <Drawer
        open={orgDrawer.open}
        title={orgDraft.id ? "Edit Organization" : "New Organization"}
        subtitle="ERP Company Profile (Address, VAT, License, Contact, Branding)."
        onClose={() => setOrgDrawer({ open: false, item: undefined })}
      >
        <div className="space-y-6">
          <SectionTitle
            title="Branding"
            desc="Upload logo and set primary brand color."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LogoUploader
              value={orgDraft.logoUrl}
              onUploaded={({ logoMediaId, logoUrl }) =>
                setOrgDraft((s) => ({ ...s, logoMediaId, logoUrl }))
              }
            />
            <Input
              label="Primary Color"
              type="color"
              value={(orgDraft.color as any) || "#000000"}
              onChange={(v) => setOrgDraft((s) => ({ ...s, color: v }))}
            />
          </div>

          <SectionTitle title="Identity" desc="Company code and name." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Organization Code"
              placeholder="e.g. Your Organization"
              value={orgDraft.code || ""}
              onChange={(v) =>
                setOrgDraft((s) => ({ ...s, code: v.toUpperCase() }))
              }
            />
            <Input
              label="Organization Name"
              placeholder="e.g. Your Company"
              value={orgDraft.name || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, name: v }))}
            />
          </div>

          <SectionTitle title="Contact" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Phone"
              placeholder="+966 ..."
              value={orgDraft.phone || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, phone: v }))}
            />
            <Input
              label="Mobile"
              placeholder="+966 ..."
              value={orgDraft.mobile || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, mobile: v }))}
            />
            <Input
              label="Email"
              placeholder="info@yourdomain.com.sa"
              value={orgDraft.email || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, email: v }))}
            />
            <Input
              label="Website"
              placeholder="https://yourdomain.com"
              value={orgDraft.website || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, website: v }))}
            />
            <Input
              label="Email Domain"
              placeholder="yourdomain"
              value={orgDraft.emailDomain || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, emailDomain: v }))}
            />
            <Input
              label="Currency"
              placeholder="SAR"
              value={orgDraft.currency || "SAR"}
              onChange={(v) =>
                setOrgDraft((s) => ({ ...s, currency: v.toUpperCase() }))
              }
            />
          </div>

          <SectionTitle title="Address" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Address Line 1"
              placeholder="Street 1"
              value={orgDraft.addressLine1 || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, addressLine1: v }))}
            />
            <Input
              label="Address Line 2"
              placeholder="Street 2..."
              value={orgDraft.addressLine2 || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, addressLine2: v }))}
            />
            <Input
              label="Building No"
              placeholder="1234"
              value={orgDraft.buildingNumber || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, buildingNumber: v }))}
            />
            <Input
              label="Additional No"
              placeholder="1234"
              value={orgDraft.additionalNumber || ""}
              onChange={(v) =>
                setOrgDraft((s) => ({ ...s, additionalNumber: v }))
              }
            />
            <Input
              label="District"
              placeholder="District"
              value={orgDraft.district || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, district: v }))}
            />
            <Input
              label="City"
              placeholder="City"
              value={orgDraft.city || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, city: v }))}
            />
            <Input
              label="State/Region"
              placeholder="Region"
              value={orgDraft.state || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, state: v }))}
            />
            <Input
              label="Postal Code"
              placeholder="13243"
              value={orgDraft.postalCode || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, postalCode: v }))}
            />
            <Input
              label="Country"
              placeholder="Saudi Arabia"
              value={orgDraft.country || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, country: v }))}
            />
          </div>

          <SectionTitle title="Legal & VAT" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="VAT Number"
              placeholder="3004..."
              value={orgDraft.vatNumber || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, vatNumber: v }))}
            />
            <Input
              label="License Type"
              placeholder="Commercial Registration"
              value={orgDraft.licenseType || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, licenseType: v }))}
            />
            <Input
              label="License Number (Seller ID)"
              placeholder="1010..."
              value={orgDraft.licenseNo || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, licenseNo: v }))}
            />
            <Input
              label="Company ID"
              placeholder="1010..."
              value={orgDraft.companyId || ""}
              onChange={(v) => setOrgDraft((s) => ({ ...s, companyId: v }))}
            />
          </div>

          <Toggle
            label="Active"
            checked={!!orgDraft.isActive}
            onChange={(v) => setOrgDraft((s) => ({ ...s, isActive: v }))}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setOrgDrawer({ open: false, item: undefined })}
            >
              Cancel
            </Button>
            <Button
              onClick={saveOrg}
              disabled={
                loading ||
                !String(orgDraft.code || "").trim() ||
                !String(orgDraft.name || "").trim()
              }
            >
              {loading ? "Saving…" : "Save Organization"}
            </Button>
          </div>
        </div>
      </Drawer>

      {/* Brand drawer */}
      <Drawer
        open={brandDrawer.open}
        title={brandDraft.id ? "Edit Brand" : "New Brand"}
        subtitle="Child business unit under an organization (JuiceTime, Quiznos, BeefShots)."
        onClose={() => setBrandDrawer({ open: false, item: undefined })}
      >
        <div className="space-y-4">
          <Select
            label="Organization"
            value={brandDraft.organizationId}
            onChange={(v) => setBrandDraft((s) => ({ ...s, organizationId: v }))}
          >
            <option value="">Select Organization</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.code})
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Brand Code"
              placeholder="e.g. B01"
              value={brandDraft.code}
              onChange={(v) =>
                setBrandDraft((s) => ({ ...s, code: v.toUpperCase() }))
              }
            />
            <Input
              label="Brand Name"
              placeholder="e.g. Brand-01"
              value={brandDraft.name}
              onChange={(v) => setBrandDraft((s) => ({ ...s, name: v }))}
            />
          </div>

          <Toggle
            label="Active"
            checked={brandDraft.isActive}
            onChange={(v) => setBrandDraft((s) => ({ ...s, isActive: v }))}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setBrandDrawer({ open: false, item: undefined })}
            >
              Cancel
            </Button>
            <Button
              onClick={saveBrand}
              disabled={
                loading ||
                !brandDraft.organizationId ||
                !brandDraft.code.trim() ||
                !brandDraft.name.trim()
              }
            >
              {loading ? "Saving…" : "Save Brand"}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
