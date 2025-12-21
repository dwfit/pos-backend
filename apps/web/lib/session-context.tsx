"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { get, apiFetch } from "@/lib/api";

export type Brand = { id: string; name: string; code?: string | null };

export type SessionUser = {
  sub: string;
  email: string;
  permissions: string[];
  allowAllBrands: boolean;
  allowedBrandIds: string[];
  roleName?: string | null;
  role?: string | null;
};

type SessionData = {
  user: SessionUser;
  brands: Brand[];
};

type SessionState = {
  loading: boolean;
  session: SessionData | null;

  permissions: string[];
  brands: Brand[];

  allowAllBrands: boolean;
  allowedBrandIds: string[];

  selectedBrandId: string; // "ALL" or brandId
  setSelectedBrandId: (id: string) => void;

  reload: () => Promise<void>;
};

const Ctx = createContext<SessionState | null>(null);

function hasPerm(perms: string[], code: string) {
  return perms.includes(code);
}
function hasAny(perms: string[], codes: string[]) {
  return codes.some((c) => perms.includes(c));
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);

  const [selectedBrandId, setSelectedBrandId] = useState<string>("ALL");

  async function reload() {
    setLoading(true);
    try {
      const data = await apiFetch<SessionData>("/session", { method: "GET" });
      setSession(data);

      // Initialize selected brand:
      const saved = typeof window !== "undefined" ? localStorage.getItem("selectedBrandId") : null;

      const allowAll = data.user.allowAllBrands;
      const visibleBrandIds = new Set(data.brands.map((b) => b.id));

      let next = saved || (allowAll ? "ALL" : (data.brands[0]?.id || "ALL"));

      // If restricted, never allow "ALL"
      if (!allowAll && next === "ALL") next = data.brands[0]?.id || "ALL";

      // If saved brand not visible, fallback
      if (next !== "ALL" && !visibleBrandIds.has(next)) {
        next = allowAll ? "ALL" : (data.brands[0]?.id || "ALL");
      }

      setSelectedBrandId(next);
      if (typeof window !== "undefined") localStorage.setItem("selectedBrandId", next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedBrandId", selectedBrandId);
    }
  }, [selectedBrandId]);

  const permissions = session?.user.permissions || [];
  const brands = session?.brands || [];
  const allowAllBrands = session?.user.allowAllBrands ?? true;
  const allowedBrandIds = session?.user.allowedBrandIds ?? [];

  const value: SessionState = {
    loading,
    session,
    permissions,
    brands,
    allowAllBrands,
    allowedBrandIds,
    selectedBrandId,
    setSelectedBrandId,
    reload,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

// export helpers if needed
export const rbac = { hasPerm, hasAny };
