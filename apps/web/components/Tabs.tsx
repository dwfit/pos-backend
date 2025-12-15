"use client";
import { useState } from "react";

export function Tabs({
  tabs,
  initial = 0,
}: {
  tabs: { label: string; content: React.ReactNode }[];
  initial?: number;
}) {
  const [i, setI] = useState(initial);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map((t, idx) => (
          <button
            key={t.label}
            onClick={() => setI(idx)}
            className={`px-4 h-10 rounded-xl text-sm font-medium ${
              i === idx ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="card p-4">{tabs[i].content}</div>
    </div>
  );
}
