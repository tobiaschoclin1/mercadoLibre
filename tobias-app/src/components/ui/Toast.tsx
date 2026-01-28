'use client';

import { createContext, useContext, useMemo, useState, ReactNode } from "react";

type Toast = { id: number; title?: string; message: string };
type ToastContext = { notify: (message: string, title?: string) => void };

const ToastCtx = createContext<ToastContext | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider/>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const notify = (message: string, title?: string) => {
    const id = Date.now();
    setItems((prev) => [...prev, { id, title, message }]);
    setTimeout(() => setItems((prev) => prev.filter(t => t.id !== id)), 3500);
  };
  const value = useMemo(() => ({ notify }), []);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed right-4 bottom-4 space-y-2 z-50">
        {items.map(t => (
          <div key={t.id} className="rounded-2xl shadow-lg px-4 py-3 bg-fiddo-orange text-white">
            {t.title && <div className="font-semibold">{t.title}</div>}
            <div className="text-sm">{t.message}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}