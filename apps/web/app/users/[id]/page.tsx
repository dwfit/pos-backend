"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Role = { id: string; name: string };
type Branch = { id: string; name: string; reference?: string | null };

type UserDetail = {
  id: string;
  name: string;
  email: string | null;
  employeeNumber?: string | null;
  phone?: string | null;
  language?: string;
  displayLocalizedNames?: boolean;
  lastConsoleLogin?: string | null;
  emailVerified?: boolean;
  role: Role | null;
  branches: Branch[];
};

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const userId = params.id;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // edit user modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLanguage, setEditLanguage] = useState("en");
  const [editEmployeeNumber, setEditEmployeeNumber] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editLoginPin, setEditLoginPin] = useState("");
  const [editDisplayLocalizedNames, setEditDisplayLocalizedNames] =
    useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // delete user
  const [deleting, setDeleting] = useState(false);

  // change password modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // roles modal
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [savingRole, setSavingRole] = useState(false);

  // branches modal
  const [branchesModalOpen, setBranchesModalOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [savingBranches, setSavingBranches] = useState(false);

  const loadUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/users/${userId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load user");
      }
      const data: UserDetail = await res.json();

      // ensure branches is always an array
      data.branches = Array.isArray(data.branches) ? data.branches : [];

      setUser(data);
    } catch (err: any) {
      setError(err.message || "Error loading user");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, [userId]);

  /* ---------- Edit User ---------- */

  const openEditUser = () => {
    if (!user) return;
    setEditName(user.name);
    setEditLanguage(user.language || "en");
    setEditEmployeeNumber(user.employeeNumber || "");
    setEditPhone(user.phone || "");
    setEditEmail(user.email || "");
    setEditLoginPin("");
    setEditDisplayLocalizedNames(!!user.displayLocalizedNames);
    setEditModalOpen(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setSavingEdit(true);
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editName,
          language: editLanguage,
          employeeNumber: editEmployeeNumber,
          phone: editPhone,
          email: editEmail,
          loginPin: editLoginPin,
          displayLocalizedNames: editDisplayLocalizedNames,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update user");
      }

      const updated: UserDetail = await res.json();
      updated.branches = Array.isArray(updated.branches)
        ? updated.branches
        : [];
      setUser(updated);
      setEditModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Error updating user");
    } finally {
      setSavingEdit(false);
    }
  };

  /* ---------- Delete User ---------- */

  const handleDeleteUser = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    try {
      setDeleting(true);
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(text || "Failed to delete user");
      }

      router.push("/users");
    } catch (err: any) {
      alert(err.message || "Error deleting user");
    } finally {
      setDeleting(false);
    }
  };

  /* ---------- Change Password ---------- */

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      setSavingPassword(true);
      const res = await fetch(`${API_BASE}/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to change password");
      }

      setPasswordModalOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      alert(err.message || "Error changing password");
    } finally {
      setSavingPassword(false);
    }
  };

  /* ---------- Edit Role ---------- */

  const openRolesModal = async () => {
    try {
      if (roles.length === 0) {
        const res = await fetch(`${API_BASE}/roles`, {
          credentials: "include",
        });
        if (res.ok) {
          const json = await res.json();
          const list: Role[] = Array.isArray(json)
            ? json
            : Array.isArray(json.items)
            ? json.items
            : [];
          setRoles(list);
        }
      }
      setSelectedRoleId(user?.role?.id || "");
      setRolesModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleId) {
      alert("Please select a role");
      return;
    }

    try {
      setSavingRole(true);
      const res = await fetch(`${API_BASE}/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roleId: selectedRoleId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update role");
      }

      const updated: UserDetail = await res.json();
      updated.branches = Array.isArray(updated.branches)
        ? updated.branches
        : [];
      setUser(updated);
      setRolesModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Error updating role");
    } finally {
      setSavingRole(false);
    }
  };

  /* ---------- Edit Branches ---------- */

  const openBranchesModal = async () => {
    try {
      if (branches.length === 0) {
        const res = await fetch(`${API_BASE}/branches`, {
          credentials: "include",
        });

        if (res.ok) {
          const json = await res.json();
          // your API returns { data: [...] }
          const list: Branch[] = Array.isArray(json)
            ? json
            : Array.isArray(json.data)
            ? json.data
            : Array.isArray(json.items)
            ? json.items
            : [];

          setBranches(list);
        } else {
          setBranches([]); // on error, keep it an empty array
        }
      }

      setSelectedBranchIds(user?.branches.map((b) => b.id) || []);
      setBranchesModalOpen(true);
    } catch (err) {
      console.error(err);
      setBranches([]); // safety
      setBranchesModalOpen(true);
    }
  };

  const toggleBranch = (id: string) => {
    setSelectedBranchIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveBranches = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingBranches(true);
      const res = await fetch(`${API_BASE}/users/${userId}/branches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ branchIds: selectedBranchIds }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update branches");
      }

      const updated: UserDetail = await res.json();
      updated.branches = Array.isArray(updated.branches)
        ? updated.branches
        : [];
      setUser(updated);
      setBranchesModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Error updating branches");
    } finally {
      setSavingBranches(false);
    }
  };

  /* ---------- Render ---------- */

  if (loading) return <div className="p-6 text-gray-600">Loading...</div>;

  if (error || !user)
    return (
      <div className="p-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:underline mb-4"
        >
          &lt; Back
        </button>
        <div className="text-red-600">{error || "User not found"}</div>
      </div>
    );

  const userBranches = Array.isArray(user.branches) ? user.branches : [];

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="text-sm text-blue-600 hover:underline"
      >
        &lt; Back
      </button>

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <div className="flex gap-2">
          <button
            className="border px-3 py-2 rounded text-sm"
            onClick={() => alert("Notifications – TODO")}
          >
            Notifications
          </button>
          <button
            className="border px-3 py-2 rounded text-sm"
            onClick={() => setPasswordModalOpen(true)}
          >
            Change Password
          </button>
          <button
            className="bg-black text-white px-4 py-2 rounded text-sm hover:opacity-90"
            onClick={openEditUser}
          >
            Edit User
          </button>
        </div>
      </div>

      {/* Basic info card */}
      <div className="bg-white shadow rounded-lg p-4 grid grid-cols-2 gap-6 text-sm">
        <div>
          <div className="text-gray-500">Name</div>
          <div className="font-medium">{user.name}</div>
        </div>
        <div>
          <div className="text-gray-500">Email</div>
          <div className="font-medium">{user.email || "—"}</div>
        </div>
        <div>
          <div className="text-gray-500">Employee Number</div>
          <div className="font-medium">{user.employeeNumber || "—"}</div>
        </div>
        <div>
          <div className="text-gray-500">Phone</div>
          <div className="font-medium">{user.phone || "—"}</div>
        </div>
        <div>
          <div className="text-gray-500">Display Localized Names</div>
          <div className="font-medium">
            {user.displayLocalizedNames ? "Yes" : "No"}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Email Verified</div>
          <div className="font-medium">
            {user.emailVerified ? "Yes" : "No"}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Last Console Login</div>
          <div className="font-medium">{user.lastConsoleLogin || "—"}</div>
        </div>
      </div>

      {/* Roles section */}
      <section className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-semibold">Roles</h2>
          <button
            onClick={openRolesModal}
            className="border px-3 py-1 rounded text-xs"
          >
            Edit Roles
          </button>
        </div>
        <div className="bg-white shadow rounded-lg p-3 text-sm">
          {user.role ? user.role.name : "No role assigned"}
        </div>
      </section>

      {/* Branches section */}
      <section className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-semibold">Branches</h2>
          <button
            onClick={openBranchesModal}
            className="border px-3 py-1 rounded text-xs"
          >
            Edit Branches
          </button>
        </div>
        <div className="bg-white shadow rounded-lg text-sm">
          {userBranches.length === 0 ? (
            <div className="p-3 text-gray-500">No branches assigned</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Reference
                  </th>
                </tr>
              </thead>
              <tbody>
                {userBranches.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-4 py-2">{b.name}</td>
                    <td className="px-4 py-2">{b.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Tags placeholder */}
      <section className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-semibold">Tags</h2>
          <button
            onClick={() => alert("Add Tags – TODO")}
            className="border px-3 py-1 rounded text-xs"
          >
            Add Tags
          </button>
        </div>
        <div className="bg-white shadow rounded-lg p-4 text-sm text-center text-gray-500">
          Add tags to help you filter and group users easily. You can create
          tags such as Supervisors, Night Shift, etc.
        </div>
      </section>

      {/* --------- Modals --------- */}

      {/* Edit User */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-[420px] rounded-lg p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit user</h2>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-gray-500 text-xl"
              >
                ×
              </button>
            </div>
            <form className="space-y-3" onSubmit={handleSaveEditUser}>
              <div>
                <label className="block text-sm font-medium">Name *</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Language *</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={editLanguage}
                  onChange={(e) => setEditLanguage(e.target.value)}
                  required
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Employee Number
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={editEmployeeNumber}
                  onChange={(e) => setEditEmployeeNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Phone</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Login PIN</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={editLoginPin}
                  onChange={(e) => setEditLoginPin(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="displayLocalizedNames"
                  type="checkbox"
                  checked={editDisplayLocalizedNames}
                  onChange={(e) =>
                    setEditDisplayLocalizedNames(e.target.checked)
                  }
                />
                <label
                  htmlFor="displayLocalizedNames"
                  className="text-sm cursor-pointer"
                >
                  Display Localized Names
                </label>
              </div>

              <div className="flex justify-between items-center pt-3">
                {/* Delete button on the left */}
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : "Delete User"}
                </button>

                {/* Close + Save on the right */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="border border-gray-400 px-4 py-2 rounded hover:bg-gray-100 text-sm"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="bg-black text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-60 text-sm"
                  >
                    {savingEdit ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-[420px] rounded-lg p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Change Password</h2>
              <button
                onClick={() => setPasswordModalOpen(false)}
                className="text-gray-500 text-xl"
              >
                ×
              </button>
            </div>
            <form className="space-y-3" onSubmit={handleSavePassword}>
              <div>
                <label className="block text-sm font-medium">
                  New Password *
                </label>
                <input
                  type="password"
                  className="w-full border rounded px-3 py-2"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  className="w-full border rounded px-3 py-2"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="border border-gray-400 px-4 py-2 rounded hover:bg-gray-100 text-sm"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="bg-black text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-60 text-sm"
                >
                  {savingPassword ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Roles */}
      {rolesModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-[360px] rounded-lg p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Roles</h2>
              <button
                onClick={() => setRolesModalOpen(false)}
                className="text-gray-500 text-xl"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleSaveRole}>
              <div>
                <label className="block text-sm font-medium">Roles</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                >
                  <option value="">Select role</option>
                  {Array.isArray(roles) &&
                    roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRolesModalOpen(false)}
                  className="border border-gray-400 px-4 py-2 rounded hover:bg-gray-100 text-sm"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingRole}
                  className="bg-black text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-60 text-sm"
                >
                  {savingRole ? "Applying..." : "Apply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Branches */}
      {branchesModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-[420px] rounded-lg p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Branches</h2>
              <button
                onClick={() => setBranchesModalOpen(false)}
                className="text-gray-500 text-xl"
              >
                ×
              </button>
            </div>
            <form
              className="space-y-3 max-h-[340px] overflow-y-auto"
              onSubmit={handleSaveBranches}
            >
              <div className="space-y-2">
                {Array.isArray(branches) && branches.length > 0 ? (
                  branches.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBranchIds.includes(b.id)}
                        onChange={() => toggleBranch(b.id)}
                      />
                      <span>
                        {b.name}
                        {b.reference ? ` (${b.reference})` : ""}
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm">
                    No branches available
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBranchesModalOpen(false)}
                  className="border border-gray-400 px-4 py-2 rounded hover:bg-gray-100 text-sm"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingBranches}
                  className="bg-black text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-60 text-sm"
                >
                  {savingBranches ? "Applying..." : "Apply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
