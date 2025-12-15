"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Tax = { id: number; name: string; rate: number };
type TaxGroup = { id: number; name: string; taxes: { id: number; name: string; rate: number }[] };

const API = "/api"; // using proxy from next.config.js

/* ========== Reusable UI ========== */
function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
            <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
            <button
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-700">{label}</span>
        {hint ? <span className="text-[11px] text-neutral-400">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

/* ========== Main Page ========== */
export default function TaxesAndGroupsPage() {
  const [activeTab, setActiveTab] = useState<"general" | "deleted">("general");
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [groups, setGroups] = useState<TaxGroup[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    const [t, g] = await Promise.all([
      fetch(`${API}/settings/taxes`).then(r => r.json()),
      fetch(`${API}/settings/tax-groups`).then(r => r.json()),
    ]);
    setTaxes(t);
    setGroups(g);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  /* ---------------- Tax modal ---------------- */
  const [openCreateTax, setOpenCreateTax] = useState(false);
  const [taxForm, setTaxForm] = useState({ name: "", rate: "" });
  const [taxErrors, setTaxErrors] = useState<{ name?: string; rate?: string }>({});

  function validateTax() {
    const errs: typeof taxErrors = {};
    if (!taxForm.name.trim()) errs.name = "Required";
    const n = Number(taxForm.rate);
    if (Number.isNaN(n)) errs.rate = "Enter number";
    else if (n < 0 || n > 100) errs.rate = "0–100";
    setTaxErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function saveTax() {
    if (!validateTax()) return;
    const res = await fetch(`${API}/settings/taxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: taxForm.name.trim(), rate: Number(taxForm.rate) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to save tax");
      return;
    }
    setTaxForm({ name: "", rate: "" });
    setOpenCreateTax(false);
    await loadAll();
  }

  /* ---------------- Group modal ---------------- */
  const [openCreateGroup, setOpenCreateGroup] = useState(false);
  const [groupForm, setGroupForm] = useState<{ name: string; selected: Set<number> }>({ name: "", selected: new Set() });
  const [groupErrors, setGroupErrors] = useState<{ name?: string; selected?: string }>({});

  function toggleTaxInGroup(id: number) {
    setGroupForm(f => {
      const next = new Set(f.selected);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...f, selected: next };
    });
  }

  function validateGroup() {
    const errs: typeof groupErrors = {};
    if (!groupForm.name.trim()) errs.name = "Required";
    if (groupForm.selected.size === 0) errs.selected = "Select at least one";
    setGroupErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function saveGroup() {
    if (!validateGroup()) return;
    const res = await fetch(`${API}/settings/tax-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupForm.name.trim(), taxIds: [...groupForm.selected] }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to save group");
      return;
    }
    setGroupForm({ name: "", selected: new Set() });
    setOpenCreateGroup(false);
    await loadAll();
  }

  return (
    <div className="space-y-8 text-neutral-900">
      <Link href="/general" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
        <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="2">
          <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Taxes &amp; Groups</h1>
        <div className="mt-3 flex gap-6 border-b border-neutral-200 text-sm">
          {(["general", "deleted"] as const).map(tab => (
            <button
              key={tab}
              className={`pb-2 font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-black text-black"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "general" && (
        <>
          {/* Taxes */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Taxes</h2>
              <button
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                onClick={() => setOpenCreateTax(true)}
              >
                Create Tax
              </button>
            </div>

            {loading ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {taxes.map(t => (
                  <div key={t.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow">
                    <div className="font-semibold">{t.name}</div>
                    <div className="mt-1 text-sm text-neutral-600">{Number(t.rate).toFixed(2)}%</div>
                  </div>
                ))}
                {taxes.length === 0 && <div className="text-sm text-neutral-500">No taxes yet.</div>}
              </div>
            )}
          </section>

          <hr className="my-8 border-neutral-200" />

          {/* Tax Groups */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Tax Groups</h2>
              <button
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                onClick={() => setOpenCreateGroup(true)}
              >
                Create Tax Group
              </button>
            </div>

            {loading ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map(g => (
                  <div key={g.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow">
                    <div className="font-semibold">{g.name}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {g.taxes.map(t => (
                        <span
                          key={t.id}
                          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {groups.length === 0 && <div className="text-sm text-neutral-500">No tax groups yet.</div>}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === "deleted" && <div className="text-sm text-neutral-500">No deleted taxes.</div>}

      {/* Modals */}
      <Modal open={openCreateTax} title="Create Tax" onClose={() => setOpenCreateTax(false)}>
        <div className="space-y-4">
          <Field label="Tax Name" hint="e.g., 15% VAT" error={taxErrors.name}>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              value={taxForm.name}
              onChange={e => setTaxForm(f => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Rate (%)" hint="0–100" error={taxErrors.rate}>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              value={taxForm.rate}
              onChange={e => setTaxForm(f => ({ ...f, rate: e.target.value }))}
            />
          </Field>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              onClick={() => setOpenCreateTax(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              onClick={saveTax}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={openCreateGroup} title="Create Tax Group" onClose={() => setOpenCreateGroup(false)}>
        <div className="space-y-4">
          <Field label="Group Name" hint="e.g., VAT Group" error={groupErrors.name}>
            <input
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              value={groupForm.name}
              onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Taxes in Group" hint="Select one or more" error={groupErrors.selected}>
            <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
              {taxes.length === 0 && <p className="text-xs text-neutral-500">No taxes yet—create one first.</p>}
              {taxes.map(t => {
                const checked = groupForm.selected.has(t.id);
                return (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-neutral-400 accent-black"
                      checked={checked}
                      onChange={() => toggleTaxInGroup(t.id)}
                    />
                    <span className="text-neutral-700">
                      {t.name} <span className="text-neutral-500">({Number(t.rate).toFixed(2)}%)</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              onClick={() => setOpenCreateGroup(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              onClick={saveGroup}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
