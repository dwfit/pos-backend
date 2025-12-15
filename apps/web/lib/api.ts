// apps/web/lib/api.ts

// Base API URL
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "http://localhost:4000";

// -------------------------
// Helpers for browser storage
// -------------------------
function getToken(key: string) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function setToken(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value == null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

// -------------------------
// Refresh logic
// -------------------------

let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getToken("refreshToken");
      if (!refreshToken) throw new Error("NO_REFRESH_TOKEN");

      const resp = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken,
          deviceId: "WEB",
        }),
      });

      if (!resp.ok) {
        throw new Error("REFRESH_FAILED");
      }

      const data = await resp.json();
      if (!data.accessToken)
        throw new Error("NO_ACCESS_TOKEN_IN_REFRESH");

      // Save new tokens
      setToken("accessToken", data.accessToken);
      if (data.refreshToken) {
        setToken("refreshToken", data.refreshToken);
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

// -------------------------
// Main API Fetch
// -------------------------
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let accessToken = getToken("accessToken");

  const doRequest = async () => {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    // Any non-401 response → done
    if (resp.status !== 401) return resp;

    // Parse error body
    let data: any = null;
    try {
      data = await resp.clone().json();
      console.log("apiFetch 401 body", data);
    } catch {
      console.log("apiFetch 401 body (non-JSON)");
    }

    const isTokenExpired =
      data?.code === "TOKEN_EXPIRED" ||
      data?.error === "TOKEN_EXPIRED";

    // Only refresh if backend says TOKEN_EXPIRED
    if (!isTokenExpired) {
      // INVALID_TOKEN / UNAUTHENTICATED / etc. – no refresh
      return resp;
    }

    // Token expired → auto refresh
    try {
      await refreshAccessToken();
    } catch (err) {
      console.warn("apiFetch: refresh failed", err);
      return resp;
    }

    // Update token
    accessToken = getToken("accessToken");

    // Retry original request once
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  };

  const response = await doRequest();

  // If still 401 → session is dead
  if (response.status === 401) {
    console.warn("apiFetch: 401 after refresh, redirecting to login");
    setToken("accessToken", null);
    setToken("refreshToken", null);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const currentPath = url.pathname + url.search;
      const redirectParam = encodeURIComponent(currentPath);

      window.location.href = `/login?reason=sessionExpired&redirect=${redirectParam}`;
    }

    throw new Error("SESSION_EXPIRED");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} – ${text}`);
  }

  return response.json() as Promise<T>;
}

// -------------------------
// Shorthand Helpers
// -------------------------
export function get<T = any>(path: string) {
  return apiFetch<T>(path, { method: "GET" });
}

export function post<T = any>(path: string, body?: any) {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function del<T = any>(path: string) {
  return apiFetch<T>(path, { method: "DELETE" });
}

export function put<T = any>(path: string, body?: any) {
  return apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body ?? {}),
  });
}
