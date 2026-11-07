import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, UNAUTHORIZED_EVENT, api } from "../api/client";
import type { User } from "../api/types";
import { Button, Spinner } from "../components/ui";

type Status = "loading" | "in" | "out" | "error";

interface AuthApi {
  user: User | null;
  status: Status;
  error: string | null;
  /** Re-reads the session (after demo / login / signup). Resolves with the user, or null when signed out. */
  refresh: () => Promise<User | null>;
  setUser: (u: User) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = await api.me();
      setUserState(u);
      setStatus("in");
      setError(null);
      return u;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUserState(null);
        setStatus("out");
        setError(null);
        return null;
      }
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // any other request that comes back 401 means the session is gone
  useEffect(() => {
    const onUnauthorized = () => {
      setUserState(null);
      setStatus("out");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    setStatus("in");
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUserState(null);
      setStatus("out");
    }
  }, []);

  const value = useMemo(() => ({ user, status, error, refresh, setUser, logout }), [user, status, error, refresh, setUser, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Only allow same-site relative paths as a post-login destination. */
export function safeNext(next: string | null | undefined, fallback = "/projects") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login") || next.startsWith("/signup")) return fallback;
  return next;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error, refresh } = useAuth();
  const loc = useLocation();
  if (status === "loading")
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  if (status === "error")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[13px] text-zinc-400">
        <span>{error}</span>
        <Button size="sm" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  if (status === "out") {
    const next = loc.pathname + loc.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

export function initials(u: User) {
  if (u.is_guest) return "G";
  const src = u.name || u.email || "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
