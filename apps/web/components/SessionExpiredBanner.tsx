"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearTokens } from "@/lib/http";

export function SessionExpiredBanner({
  message,
  autoRedirectSeconds = 5,
  showCancel = true,
}: {
  message?: string;
  autoRedirectSeconds?: number;
  showCancel?: boolean;
}) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(autoRedirectSeconds);
  const [cancelled, setCancelled] = useState(false);

  function goLogin() {
    clearTokens();
    const next = typeof window !== "undefined" ? window.location.pathname : "/";
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  // 🔁 auto-redirect countdown
  useEffect(() => {
    setCountdown(autoRedirectSeconds);
    setCancelled(false);

    const interval = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);

    const timeout = setTimeout(() => {
      if (!cancelled) goLogin();
    }, autoRedirectSeconds * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRedirectSeconds]);

  // if user cancels, stop redirect (but keep banner visible)
  useEffect(() => {
    if (!cancelled) return;
    // no extra code needed; timeout is prevented by the check
  }, [cancelled]);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
      <div>
        <div className="font-semibold">Session expired</div>

        <div className="opacity-90">
          {message || "Please log in again to continue."}{" "}
          {!cancelled && (
            <span className="opacity-80">(redirecting in {countdown}s)</span>
          )}
          {cancelled && <span className="opacity-80">(redirect cancelled)</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showCancel && !cancelled && (
          <button
            onClick={() => setCancelled(true)}
            className="shrink-0 rounded-lg border border-red-200 bg-white px-4 py-2 text-red-700 hover:bg-red-100"
          >
            Cancel
          </button>
        )}

        <button
          onClick={goLogin}
          className="shrink-0 rounded-lg bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Login again
        </button>
      </div>
    </div>
  );
}
