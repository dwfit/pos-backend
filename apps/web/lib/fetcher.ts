// apps/web/lib/fetcher.ts
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getToken() {
  if (typeof window === "undefined") return null;
  try {
    // 👇 MUST match what you store on login ("token", "accessToken", etc.)
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

export async function json<T>(path: string, fallback: T): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const headers: HeadersInit = {};
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const r = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!r.ok) {
      console.error("json() request failed:", r.status, url);
      throw new Error(String(r.status));
    }

    return (await r.json()) as T;
  } catch (err) {
    console.error("json() error:", url, err);
    return fallback;
  }
}
