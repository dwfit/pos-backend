// apps/web/app/api/devices/online/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  "http://127.0.0.1:4000";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/devices/online`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": res.headers.get("content-type") || "text/plain" },
      });
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "proxy_failed", message: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
