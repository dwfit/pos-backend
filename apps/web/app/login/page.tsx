'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      console.log('🟢 Submitting login', { email });

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ⬅️ keep cookies for pos_token
        body: JSON.stringify({ email, password }),
      });

      console.log('🔵 /auth/login status:', res.status);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || `Login failed (${res.status})`;
        console.error('🔴 Login failed:', message);
        setError(message);
        return;
      }

      const data = await res.json().catch(() => null);
      console.log('✅ Login success payload:', data);

      // 🔑 Store JWT + role in localStorage for requireAuth (Bearer token)
      if (typeof window !== 'undefined' && data) {
        if (data.token) {
          console.log('💾 Storing JWT token in localStorage');
          localStorage.setItem('token', data.token);
        }

        if (data.appRole) {
          localStorage.setItem('role', data.appRole);
        }

        if (data.id) {
          localStorage.setItem('userId', data.id);
        }
      }

      // 💥 ALWAYS redirect to "/" after successful login
      console.log('➡️ Forcing redirect to "/"');
      router.replace('/');

      // Hard fallback: full-page reload to "/"
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } catch (err: any) {
      console.error('🔥 Login error:', err);
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl bg-white shadow px-6 py-8">
        <h1 className="text-xl font-semibold mb-1">POS Console Login</h1>
        <p className="text-xs text-slate-500 mb-4">
          Sign in to access your dashboard.
        </p>

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
