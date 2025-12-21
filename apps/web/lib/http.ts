// apps/web/lib/http.ts
'use client';

import { authStore } from '@/lib/auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || localStorage.getItem('pos_token') || '';
}

// ✅ This is what your layout imports
export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('pos_token');
}

// safe JSON parse (because some endpoints return text / empty)
function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: 'include',
  });

  const text = await res.text().catch(() => '');
  const data = text ? safeJson(text) : null;

  // ✅ global auth handling
  if (res.status === 401) {
    const msg =
      data?.message ||
      (data?.code === 'TOKEN_EXPIRED'
        ? 'Session expired. Please log in again.'
        : 'Unauthorized. Please log in again.');

    // clear tokens and trigger banner ONCE
    clearTokens();
    authStore.expire(msg);

    throw new Error(msg);
  }

  if (!res.ok) {
    throw new Error(data?.message || `Request failed: ${res.status}`);
  }

  // empty response allowed
  return (data ?? null) as T;
}

// optional convenience helpers
export const http = {
  get: <T>(path: string) => fetchJson<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: any) =>
    fetchJson<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: any) =>
    fetchJson<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  del: <T>(path: string) => fetchJson<T>(path, { method: 'DELETE' }),
};
