import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Info, X, XCircle } from "lucide-react";
import { cn } from "../lib/format";

type Tone = "success" | "error" | "info" | "reject";
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  body?: ReactNode;
}

interface ToastApi {
  toast: (t: { tone?: Tone; title: string; body?: ReactNode; ms?: number }) => void;
}

const Ctx = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback<ToastApi["toast"]>(
    ({ tone = "info", title, body, ms = 3800 }) => {
      const id = seq++;
      setItems((xs) => [...xs.slice(-3), { id, tone, title, body }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? CircleAlert : t.tone === "reject" ? XCircle : Info;
          return (
            <div
              key={t.id}
              role="status"
              data-testid="toast"
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/95 px-3.5 py-3 shadow-xl shadow-black/40 backdrop-blur animate-toast-in"
            >
              <Icon
                className={cn(
                  "mt-px size-4 shrink-0",
                  t.tone === "success" ? "text-emerald-400" : t.tone === "error" || t.tone === "reject" ? "text-red-400" : "text-sky-400",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-zinc-100">{t.title}</div>
                {t.body && <div className="mt-0.5 text-xs text-zinc-400">{t.body}</div>}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-zinc-500 hover:text-zinc-200" aria-label="Dismiss">
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
