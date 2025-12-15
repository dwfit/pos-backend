import { useEffect, useState } from "react";

type ToastItem = { id: string; kind?: "success" | "error" | "info"; text: string };

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  function push(toast: Omit<ToastItem, "id">) {
    const id = crypto.randomUUID();
    setItems((t) => [...t, { id, ...toast }]);
    setTimeout(() => setItems((t) => t.filter(i => i.id !== id)), 3200);
  }
  return { items, push, remove: (id: string) => setItems((t) => t.filter(i => i.id !== id)) };
}

export function ToastStack({ items, remove }:{ items:ToastItem[]; remove:(id:string)=>void }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map(({ id, kind = "success", text }) => {
        const tone =
          kind === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          kind === "error"   ? "bg-rose-50 border-rose-200 text-rose-800" :
                               "bg-sky-50 border-sky-200 text-sky-800";
        return (
          <div key={id} role="status" className={`rounded-xl border px-3 py-2 text-sm shadow-sm ${tone}`}>
            <div className="flex items-start gap-2">
              <span className="mt-1 inline-block size-2 rounded-full bg-current/60" />
              <div className="flex-1">{text}</div>
              <button onClick={() => remove(id)} className="ml-2 text-xs opacity-60 hover:opacity-100">Dismiss</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
