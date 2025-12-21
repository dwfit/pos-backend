"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";

type Role = {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
};
type Brand = {
  id: string;
  name: string;
  code?: string;
};

type Role = {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];

  // NEW:
  allowedOrganization?: boolean;
  allowedBrandIds?: string[];    
};

const API_BASE = "http://localhost:4000";

type PermissionGroup = {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
};

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "orders",
    label: "Order Authorities",
    permissions: [
      { key: "orders.read", label: "Read Orders" },
      { key: "orders.manage", label: "Manage orders" },
      { key: "orders.tags.manage", label: "Manage Orders Tags" },
    ],
  },
  {
    key: "customers",
    label: "Customer Authorities",
    permissions: [
      { key: "customers.read", label: "Read Customers" },
      { key: "customers.insights.read", label: "Read Customers Insights" },
      { key: "customers.manage", label: "Manage Customers" },
      {
        key: "customers.houseAccount.manage",
        label: "Manage Customers House Account",
      },
      {
        key: "customers.loyalty.manage",
        label: "Manage Customers Loyalty",
      },
    ],
  },
  {
    key: "inventory",
    label: "Inventory Authorities",
    permissions: [
      { key: "inventory.items.read", label: "Read Inventory Items" },
      { key: "inventory.items.manage", label: "Manage Inventory Items" },
      { key: "inventory.suppliers.read", label: "Read Suppliers" },
      { key: "inventory.suppliers.manage", label: "Manage Suppliers" },
      { key: "inventory.po.create", label: "Create Purchase Orders" },
      { key: "inventory.po.submit", label: "Submit Purchase Orders" },
      { key: "inventory.transfers.create", label: "Create Transfers" },
      { key: "inventory.counts.create", label: "Create Inventory Count" },
    ],
  },
  {
    key: "menu",
    label: "Menu Authorities",
    permissions: [
      { key: "menu.read", label: "Read Menu" },
      { key: "menu.manage", label: "Manage Menu" },
    ],
  },
  {
    key: "admin",
    label: "Admin Authorities",
    permissions: [
      { key: "branches.manage", label: "Manage Branches" },
      { key: "settings.manage", label: "Manage Settings" },
      { key: "taxes.manage", label: "Manage Taxes & Tax Groups" },
      { key: "devices.manage", label: "Manage Devices" },
      { key: "users.manage", label: "Manage Users" },
      { key: "discounts.manage", label: "Manage Discounts" },
    ],
  },
  {
    key: "reports",
    label: "Reports Authorities",
    permissions: [
      {
        key: "reports.costAnalysis.view",
        label: "View Cost Analysis Report",
      },
      {
        key: "reports.inventoryControl.view",
        label: "View Inventory Control Report",
      },
      { key: "reports.sales.view", label: "View Sales Reports" },
    ],
  },
  {
    key: "dashboards",
    label: "Dashboard Authorities",
    permissions: [
      { key: "dashboard.general", label: "Access General Dashboard" },
      { key: "dashboard.branches", label: "Access Branches Dashboard" },
      { key: "dashboard.inventory", label: "Access Inventory Dashboard" },
      { key: "dashboard.callcenter", label: "Access Call Center Dashboard" },
    ],
  },
  {
    key: "cashier",
    label: "Cashier & Waiter Apps Authorities",
    permissions: [
      // existing ones, kept
      { key: "pos.cashRegister", label: "Access Cash Register" },
      { key: "pos.devices.manage", label: "Access Devices Management" },
      { key: "pos.reports.access", label: "Access Reports" },

      { key: "pos.discounts.predefined.apply", label: "Apply Predefined Discounts" },
      { key: "pos.discounts.open.apply", label: "Apply Open Discounts" },

      { key: "pos.kitchen.editProducts", label: "Edit Products Sent to Kitchen" },
      { key: "pos.orders.join", label: "Join Order" },

      { key: "pos.drawer.operations", label: "Access Drawer Operations" },
      { key: "pos.eod.perform", label: "Perform End of Day" },

      { key: "pos.print.check", label: "Print Check" },
      { key: "pos.print.receipt", label: "Print Receipt" },

      { key: "pos.orders.return", label: "Return Order" },
      { key: "pos.orders.split", label: "Split Order" },
      { key: "pos.orders.viewDone", label: "View Done Orders" },

      { key: "pos.orders.void", label: "Void Orders and Products" },
      { key: "pos.payment.perform", label: "Perform Payment" },

      {
        key: "pos.orders.editOpenedByOthers",
        label: "Edit Orders Opened by Other Users",
      },
      { key: "pos.orders.changeTableOwner", label: "Change Table Owner" },
      {
        key: "pos.kitchen.sendBeforePayment",
        label: "Send to Kitchen Before Payment",
      },
      { key: "pos.kitchen.reprint", label: "Kitchen Reprint" },

      {
        key: "pos.till.closeWithActiveOrders",
        label: "Close Till/Shift With Active Orders",
      },
      {
        key: "pos.payment.payWithoutClosing",
        label: "Pay Orders Without Closing",
      },

      { key: "pos.orders.tags.manage", label: "Manage Tags on Orders" },
      {
        key: "pos.productAvailability.manage",
        label: "Manage Product Availability",
      },

      { key: "pos.orders.applyAhead", label: "Apply Ahead Orders" },

      // driver / waiter / spot checks etc.
      { key: "pos.driver", label: "Act as Driver" },
      { key: "pos.spotCheck.perform", label: "Perform Spot Check" },
      {
        key: "pos.openPriceProduct.add",
        label: "Add Open Price Product",
      },
      { key: "pos.waiter", label: "Act as Waiter" },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*                                   MAIN PAGE                                */
/* -------------------------------------------------------------------------- */
export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/roles`, { credentials: "include" });
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.roles)
        ? data.roles
        : [];
      setRoles(list);
    } catch (err) {
      console.error("Failed to load roles:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const deleteRole = async (id: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;
    const res = await fetch(`${API_BASE}/roles/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setRoles((r) => r.filter((x) => x.id !== id));
    } else {
      alert("Failed to delete role");
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Roles</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-black hover:bg-gray-900 text-white px-4 py-2 rounded flex items-center gap-1"
        >
          <Plus size={16} /> Create Role
        </button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : roles.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-3 sm:grid-cols-2">
          {roles.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-lg shadow p-4 flex flex-col justify-between"
            >
              <div>
                <div className="font-semibold text-lg">{r.name}</div>
                {r.description && (
                  <div className="text-xs text-gray-500 mt-1">
                    {r.description}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setEditRole(r)}
                  className="flex-1 flex items-center justify-center gap-1 text-sm bg-black text-white rounded py-1 hover:bg-gray-900"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  onClick={() => deleteRole(r.id)}
                  className="flex-1 flex items-center justify-center gap-1 text-sm bg-red-600 text-white rounded py-1 hover:bg-red-700"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 mt-4">No roles found.</p>
      )}

      {showCreate && (
        <RoleModal
          title="Create Role"
          onClose={() => setShowCreate(false)}
          onSaved={loadRoles}
        />
      )}
      {editRole && (
        <RoleModal
          title="Edit Role"
          existing={editRole}
          onClose={() => setEditRole(null)}
          onSaved={loadRoles}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   MODAL                                    */
/* -------------------------------------------------------------------------- */
function RoleModal({
  title,
  existing,
  onClose,
  onSaved,
}: {
  title: string;
  existing?: Role;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [nameLocalized, setNameLocalized] = useState(""); // UI only for now
  const [description, setDescription] = useState(existing?.description || "");

  const [selected, setSelected] = useState<string[]>(
    existing?.permissions || []
  );

  // ✅ always true, but show it in UI
  const [allowedOrganization] = useState(true);

  // ✅ brands
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandLoading, setBrandLoading] = useState(false);
  const [allowedBrandIds, setAllowedBrandIds] = useState<string[]>(
    existing?.allowedBrandIds || []
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(existing?.name || "");
    setDescription(existing?.description || "");
    setSelected(existing?.permissions || []);
    setAllowedBrandIds(existing?.allowedBrandIds || []);
  }, [existing]);

  // Load brands for selection
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setBrandLoading(true);
        const res = await fetch(`${API_BASE}/brands`, {
          credentials: "include",
        });
        const data = await res.json();

        // supports {brands:[...]} or [...]
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.brands)
          ? data.brands
          : [];

        if (mounted) setBrands(list);
      } catch (e) {
        console.error("Failed to load brands", e);
      } finally {
        if (mounted) setBrandLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const togglePermission = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const toggleGroup = (group: PermissionGroup) => {
    const keys = group.permissions.map((p) => p.key);
    const allSelected = keys.every((k) => selected.includes(k));
    setSelected((prev) =>
      allSelected
        ? prev.filter((p) => !keys.includes(p))
        : Array.from(new Set([...prev, ...keys]))
    );
  };

  const allPermissionKeys = PERMISSION_GROUPS.flatMap((g) =>
    g.permissions.map((p) => p.key)
  );
  const allSelected =
    allPermissionKeys.length > 0 &&
    allPermissionKeys.every((k) => selected.includes(k));

  const toggleAll = () => {
    setSelected(allSelected ? [] : allPermissionKeys);
  };

  // ----------------- Brand selection helpers -----------------
  const allBrandsSelected =
    brands.length > 0 && allowedBrandIds.length === brands.length;

  const toggleBrand = (brandId: string) => {
    setAllowedBrandIds((prev) =>
      prev.includes(brandId) ? prev.filter((x) => x !== brandId) : [...prev, brandId]
    );
  };

  const toggleAllBrands = () => {
    if (!brands.length) return;
    setAllowedBrandIds(allBrandsSelected ? [] : brands.map((b) => b.id));
  };

  // ✅ Define your meaning:
  // - If allowedBrandIds is empty => allow ALL brands (recommended UX)
  // - Otherwise => restrict to selected brands
  const effectiveAllowedBrandIds =
    allowedBrandIds.length === 0 ? null : allowedBrandIds;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);

    try {
      const method = existing ? "PUT" : "POST";
      const url = existing ? `${API_BASE}/roles/${existing.id}` : `${API_BASE}/roles`;

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          permissions: selected,

          // NEW:
          allowedOrganization: true, // always true
          allowedBrandIds: effectiveAllowedBrandIds, // null => allow all
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save role:", err);
      alert("Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-[800px] max-h-[85vh] rounded-xl shadow-lg flex flex-col">
        <div className="flex justify-between items-center border-b px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium">
              Name<span className="text-red-500"> *</span>
            </label>
            <input
              className="border w-full p-2 rounded text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Name Localized</label>
            <input
              className="border w-full p-2 rounded text-sm"
              value={nameLocalized}
              onChange={(e) => setNameLocalized(e.target.value)}
              placeholder="Optional"
            />
          </div>

          {/* ✅ Access scope section */}
          <div className="border rounded-lg p-3">
            <div className="font-semibold text-sm mb-2">Access Scope</div>

            <label className="flex items-center gap-2 text-xs mb-3">
              <input type="checkbox" checked={allowedOrganization} disabled />
              Allowed Organization
            </label>

            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold">Allowed Brands</div>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={allBrandsSelected}
                  onChange={toggleAllBrands}
                  disabled={brandLoading || !brands.length}
                />
                Toggle All
              </label>
            </div>

            <div className="text-[11px] text-gray-500 mb-2">
              If you select <b>no brands</b>, it will mean <b>ALL brands allowed</b>.
            </div>

            <div className="border rounded p-2 max-h-[160px] overflow-y-auto">
              {brandLoading ? (
                <div className="text-xs text-gray-500">Loading brands…</div>
              ) : brands.length === 0 ? (
                <div className="text-xs text-gray-500">No brands found.</div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {brands.map((b) => (
                    <label key={b.id} className="flex items-center text-xs gap-2">
                      <input
                        type="checkbox"
                        checked={allowedBrandIds.includes(b.id)}
                        onChange={() => toggleBrand(b.id)}
                      />
                      {b.name} {b.code ? <span className="text-gray-400">({b.code})</span> : null}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Authorities */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Authorities</h3>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                Toggle All
              </label>
            </div>

            <div className="border rounded-lg p-3 max-h-[45vh] overflow-y-auto">
              {PERMISSION_GROUPS.map((group) => {
                const keys = group.permissions.map((p) => p.key);
                const groupAllSelected =
                  keys.length > 0 && keys.every((k) => selected.includes(k));

                return (
                  <div key={group.key} className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-sm">{group.label}</div>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={groupAllSelected}
                          onChange={() => toggleGroup(group)}
                        />
                        Toggle All
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      {group.permissions.map((perm) => (
                        <label key={perm.key} className="flex items-center text-xs gap-2">
                          <input
                            type="checkbox"
                            checked={selected.includes(perm.key)}
                            onChange={() => togglePermission(perm.key)}
                          />
                          {perm.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border text-gray-700 hover:bg-gray-100"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 text-sm rounded bg-black text-white hover:bg-gray-900 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
