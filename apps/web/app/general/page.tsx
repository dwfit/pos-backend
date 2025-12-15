import Link from "next/link";

type Tile = { href: string; label: string; badge?: string };

const TILES: Tile[] = [
    { href: "/general/taxes", label: "Taxes & Groups", badge: "Available!" },
    { href: "/general/payment-methods", label: "Payment Methods", badge: "Available!" },
    { href: "/general/charges", label: "Charges" },
    { href: "/general/delivery-zones", label: "Delivery Zones" },

    { href: "/general/tags", label: "Tags" },
    { href: "/general/reasons", label: "Reasons" },
    { href: "/general/kitchen-flows", label: "Kitchen Flows" },
    { href: "/general/reservations", label: "Reservations" },

    { href: "/general/online-ordering", label: "Online Ordering" },
    { href: "/general/notifications", label: "Notifications" },
    { href: "/general/online-payments", label: "Online Payments" },
    { href: "/general/delivery-charges", label: "Delivery Charges" },

    { href: "/general/pos-settings", label: "POS Settings" },
    { href: "/general/settings", label: "Settings" },
];

export default function GeneralPage() {
    return (
        <div className="space-y-6">
            <div
                className="
          grid gap-4
          sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
        "
            >
                {TILES.map((t) => (
                    <Link
                        key={t.href}
                        href={t.href}
                        className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-slate-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-slate-800">{t.label}</span>
                                {t.badge ? (
                                    <span className="rounded-md bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-700">
                                        {t.badge}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <svg className="ml-3 size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </Link>
                ))}
            </div>
        </div>
    );
}
