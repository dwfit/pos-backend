"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  name: string;
  consoleAccess: string;
  appAccess: string;
  role: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function UsersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // filters + pagination
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // form state
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [displayLocalizedNames, setDisplayLocalizedNames] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/users`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load users");
      const data: User[] = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Error loading users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const resetForm = () => {
    setName("");
    setLanguage("");
    setEmail("");
    setPassword("");
    setLoginPin("");
    setDisplayLocalizedNames(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (password && password.length < 6) {
      setSaving(false);
      setError("Password must be at least 6 characters long");
      return;
    }

    if (loginPin && loginPin.length < 5) {
      setSaving(false);
      setError("Login PIN must be at least 5 characters long");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          language,
          email,
          password,
          loginPin,
          displayLocalizedNames,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create user");
      }

      const created: User = await res.json();
      setUsers((prev) => [created, ...prev]);
      resetForm();
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Error saving user");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    const user = users.find((u) => u.id === id);
    const label = user?.name || "this user";

    if (!window.confirm(`Are you sure you want to delete ${label}?`)) return;

    try {
      setDeletingId(id);
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(text || "Failed to delete user");
      }

      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      alert(err.message || "Error deleting user");
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- filters + pagination ---------- */

  const filteredUsers = useMemo(() => {
    let list = [...users];

    if (roleFilter !== "ALL") {
      list = list.filter(
        (u) => (u.role || "").toLowerCase() === roleFilter.toLowerCase(),
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => {
        return (
          u.name.toLowerCase().includes(q) ||
          (u.role || "").toLowerCase().includes(q) ||
          (u.consoleAccess || "").toLowerCase().includes(q) ||
          (u.appAccess || "").toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [users, search, roleFilter]);

  // reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  const total = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pageUsers = filteredUsers.slice(startIndex, endIndex);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  // unique roles for filter dropdown
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => u.role && set.add(u.role));
    return Array.from(set);
  }, [users]);

  return (
    <div className="min-h-screen p-6 flex flex-col">
      {/* header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-gray-500">
            Manage your POS operations, catalog, and integrations.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-black text-white px-4 py-2 rounded hover:opacity-90"
        >
          Add User
        </button>
      </div>

      {/* filters row */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search name, role, access…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="ALL">All roles</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <span className="text-xs text-gray-500">Loading users…</span>
        )}
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* card with table + pinned footer */}
      <div className="bg-white shadow rounded-lg overflow-hidden flex-1 flex flex-col">
        {/* scroll area */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  Name
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  Console Access
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  App Access
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  Roles
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-6 text-gray-500"
                  >
                    Loading...
                  </td>
                </tr>
              ) : pageUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-6 text-gray-500"
                  >
                    No users found
                  </td>
                </tr>
              ) : (
                pageUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t hover:bg-gray-50 cursor-pointer"
                    onClick={() => (window.location.href = `/users/${u.id}`)}
                  >
                    <td className="px-6 py-3">{u.name}</td>
                    <td className="px-6 py-3">{u.consoleAccess}</td>
                    <td className="px-6 py-3">{u.appAccess}</td>
                    <td className="px-6 py-3">
                      <span className="inline-block border px-3 py-1 rounded text-gray-700 bg-gray-100">
                        {u.role || "—"}
                      </span>
                    </td>
                    <td
                      className="px-6 py-3"
                      onClick={(e) => e.stopPropagation()} // prevent row click
                    >
                      <div className="flex gap-2">
                        <a
                          href={`/users/${u.id}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-xs text-red-600 hover:underline disabled:opacity-60"
                          disabled={deletingId === u.id}
                        >
                          {deletingId === u.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* pinned footer (pagination) */}
        <div className="flex justify-between items-center px-6 py-3 border-t text-xs text-gray-600 bg-white">
          <span>
            {total === 0
              ? "No results"
              : `Showing ${startIndex + 1} to ${endIndex} out of ${total}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              className={`px-3 py-1.5 rounded border text-xs font-medium ${canPrev
                  ? "bg-black text-white border-black hover:bg-gray-900"
                  : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                }`}
            >
              Previous
            </button>
            <button
              onClick={() =>
                canNext && setPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={!canNext}
              className={`px-3 py-1.5 rounded border text-xs font-medium ${canNext
                  ? "bg-black text-white border-black hover:bg-gray-900"
                  : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white w-[400px] rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Add User</h2>
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium">Name *</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Language *</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  required
                >
                  <option value="">Select language</option>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Password</label>
                <input
                  type="password"
                  className="w-full border rounded px-3 py-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Login PIN</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="localized"
                  checked={displayLocalizedNames}
                  onChange={(e) =>
                    setDisplayLocalizedNames(e.target.checked)
                  }
                />
                <label htmlFor="localized" className="text-sm">
                  Display Localized Names
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="border border-gray-400 px-4 py-2 rounded hover:bg-gray-100"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-black text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
