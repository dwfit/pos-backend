// apps/web/lib/fetcher.ts
"use client";

import { authStore } from "@/lib/auth-store";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getToken() {
  if (typeof window === "undefined") return null;

  try {
    // ✅ try multiple common keys
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("access_token") ||
      null
    );
  } catch {
    return null;
  }
}

export async function json<T>(path: string, fallback: T): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const token = getToken();

  // ✅ Debug (remove later): see if token exists
  // console.log("fetcher token exists?", !!token, "url:", url);

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const r = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      credentials: "include",
    });

    // ✅ handle 401 centrally
    if (r.status === 401) {
      authStore.expire("Session expired. Please log in again.");
      return fallback;
    }

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("json() request failed:", r.status, url, txt);
      return fallback;
    }

    return (await r.json()) as T;
  } catch (err) {
    console.error("json() error:", url, err);
    return fallback;
  }
}
