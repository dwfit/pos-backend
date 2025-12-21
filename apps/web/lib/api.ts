// apps/web/lib/api.ts

// Base API URL
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? `http://${window.location.hostname}:4000`
    : "http://localhost:4000");

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

function isBrowser() {
  return typeof window !== "undefined";
}

function buildUrl(path: string) {
  // allow absolute URLs
  if (/^https?:\/\//i.test(path)) return path;
  // allow passing full path like "/customers"
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

// -------------------------
// Brand helpers (GLOBAL dynamic brandId)
// -------------------------
function getSelectedBrandId(): string {
  if (typeof window === "undefined") return "ALL";

  // You already store this in layout.tsx
  const fromStorage = localStorage.getItem("selectedBrandId");
  if (fromStorage && fromStorage.trim()) return fromStorage.trim();

  const fromWindow = (window as any).__brandId;
  if (typeof fromWindow === "string" && fromWindow.trim()) return fromWindow.trim();

  return "ALL";
}

function addBrandIdToUrl(url: string, brandId: string): string {
  // if no brand or already present, return as-is
  if (!brandId) return url;
  if (url.includes("brandId=")) return url;

  // build URL safely whether input is absolute or relative
  // Note: buildUrl will turn relative to absolute on your API domain
  const absolute = /^https?:\/\//i.test(url) ? url : buildUrl(url);
  const u = new URL(absolute);

  u.searchParams.set("brandId", brandId);

  // return in the same style as input
  if (/^https?:\/\//i.test(url)) return u.toString();
  return u.pathname + u.search;
}

// Decide whether to inject brandId for a given request
function shouldAttachBrandId(path: string, method: string): boolean {
  // Only for GET by default (safe)
  if (method.toUpperCase() !== "GET") return false;

  // Only for API_BASE calls (avoid touching external URLs)
  // If it's an absolute URL and doesn't start with API_BASE => skip
  if (/^https?:\/\//i.test(path)) {
    return path.startsWith(API_BASE);
  }

  // Relative paths are assumed to target API_BASE
  return true;
}

// -------------------------
// Force logout + redirect
// -------------------------
async function forceLogoutAndRedirect(reason = "sessionExpired") {
  // Clear local tokens (you use Authorization Bearer accessToken)
  setToken("accessToken", null);
  setToken("refreshToken", null);

  // Ask backend to clear cookies too (safe even if you don't rely on cookies)
  try {
    await fetch(buildUrl("/auth/logout"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // ignore
  }

  if (!isBrowser()) return;

  // Prevent redirect loops if already on login
  const pathname = window.location.pathname || "";
  if (pathname.startsWith("/login")) return;

  const url = new URL(window.location.href);
  const currentPath = url.pathname + url.search;
  const redirectParam = encodeURIComponent(currentPath);

  window.location.href = `/login?reason=${encodeURIComponent(
    reason
  )}&redirect=${redirectParam}`;
}

// -------------------------
// Main API Fetch (JSON by default)
// -------------------------
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getToken("accessToken");
  const method = (options.method || "GET").toUpperCase();

  // ✅ Inject brandId automatically (dynamic)
  let finalPath = path;
  if (shouldAttachBrandId(path, method)) {
    const brandId = getSelectedBrandId();
    finalPath = addBrandIdToUrl(path, brandId);
  }

  const resp = await fetch(buildUrl(finalPath), {
    ...options,
    method,
    credentials: "include", // keep cookies working too
    headers: {
      ...(options.headers || {}),
      // keep your default
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  // Handle 401 -> force logout
  if (resp.status === 401) {
    let data: any = null;
    try {
      data = await resp.clone().json();
      console.log("apiFetch 401 body", data);
    } catch {
      console.log("apiFetch 401 body (non-JSON)");
    }

    const isSessionProblem =
      data?.code === "TOKEN_EXPIRED" ||
      data?.error === "TOKEN_EXPIRED" ||
      data?.code === "UNAUTHENTICATED" ||
      data?.error === "UNAUTHENTICATED" ||
      data?.code === "INVALID_TOKEN" ||
      data?.error === "INVALID_TOKEN";

    // Always redirect to login on 401, but keep reason meaningful
    await forceLogoutAndRedirect(
      isSessionProblem ? "sessionExpired" : "unauthorized"
    );
    throw new Error(isSessionProblem ? "SESSION_EXPIRED" : "UNAUTHORIZED");
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} – ${text}`);
  }

  // If response is empty (204)
  if (resp.status === 204) return null as any;

  // Detect JSON
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const isJson = ct.includes("application/json") || ct.includes("+json");

  // Some servers return 200 with empty body
  const rawText = await resp.text().catch(() => "");
  if (!rawText) return null as any;

  if (!isJson) return rawText as any;

  try {
    return JSON.parse(rawText) as T;
  } catch {
    // fallback if server lied about content-type
    return rawText as any;
  }
}

// -------------------------
// Raw fetch (if you need status/headers)
// -------------------------
export async function apiFetchRaw(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = getToken("accessToken");
  const method = (options.method || "GET").toUpperCase();

  // ✅ Inject brandId automatically for GET (raw too)
  let finalPath = path;
  if (shouldAttachBrandId(path, method)) {
    const brandId = getSelectedBrandId();
    finalPath = addBrandIdToUrl(path, brandId);
  }

  return fetch(buildUrl(finalPath), {
    ...options,
    method,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
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
