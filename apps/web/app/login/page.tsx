"use client";

import { FormEvent, useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api";

function decodeJwt(token: string) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const redirectTo = useMemo(() => {
    const r = sp.get("redirect");
    if (r) return r;
    const next = sp.get("next");
    if (next) return next;
    return "/";
  }, [sp]);

  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // always start clean
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, deviceId: "WEB" }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message || data?.error || `Login failed (${res.status})`);
        return;
      }

      const accessToken = data?.accessToken || data?.token || null;
      const refreshToken = data?.refreshToken || null;

      if (!accessToken) {
        setError("Login 200 but no accessToken/token in response.");
        console.log("LOGIN RESPONSE:", data);
        return;
      }

      localStorage.setItem("accessToken", accessToken);
      if (refreshToken) localStorage.setItem("refreshToken", refreshToken);

      // ✅ debug: confirm saved
      const saved = localStorage.getItem("accessToken");
      console.log("✅ accessToken saved?", Boolean(saved));

      // ✅ debug: decode exp
      const decoded = decodeJwt(accessToken);
      console.log("JWT decoded:", decoded);
      if (decoded?.exp) {
        console.log("JWT exp ISO:", new Date(decoded.exp * 1000).toISOString());
      }

      // ✅ debug: immediately test an authenticated API call
      const test = await fetch(`${API_BASE}/api/customers?page=1&pageSize=1`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });

      const testBody = await test.text().catch(() => "");
      console.log("AUTH TEST status:", test.status, "body:", testBody);

      if (test.status === 401) {
        setError("Login succeeded but API test is 401. Check console logs (token exp / secret / clock).");
        return;
      }

      // ✅ force full reload navigation
      window.location.href = redirectTo;
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl bg-white shadow px-6 py-8">
        <h1 className="text-xl font-semibold mb-1">POS Console Login</h1>
        <p className="text-xs text-slate-500 mb-4">Sign in to access your dashboard.</p>

        {sp.get("reason") === "sessionExpired" && !error && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Your session expired. Please sign in again.
          </div>
        )}

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
