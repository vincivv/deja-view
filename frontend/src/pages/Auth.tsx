import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { api, MOCK } from "../api/client";
import { safeNext, useAuth } from "../auth/auth";
import { Logo, useStartDemo } from "../components/Layout";
import { Button, Field, Input, Spinner } from "../components/ui";

type Mode = "login" | "signup";

export function AuthPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const { user, status, setUser } = useAuth();
  const { start, busy: demoBusy } = useStartDemo();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upgrading = mode === "signup" && !!user?.is_guest;

  useEffect(() => {
    document.title = mode === "login" ? "Sign in · Deja View" : "Sign up · Deja View";
    return () => {
      document.title = "Deja View";
    };
  }, [mode]);

  if (status === "loading")
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  // already signed in with a real account: nothing to do here
  if (user && !user.is_guest) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email.trim()) return setErr("Enter your email.");
    if (mode === "signup" && password.length < 8) return setErr("Use at least 8 characters for the password.");
    if (!password) return setErr("Enter your password.");
    setBusy(true);
    try {
      const u =
        mode === "login"
          ? await api.login({ email: email.trim(), password })
          : await api.signup({ email: email.trim(), password, name: name.trim() || undefined });
      setUser(u);
      navigate(next, { replace: true });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "Sign in" : upgrading ? "Save your work" : "Create your account";
  const qs = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="app-grid flex min-h-full items-center justify-center px-4 py-10" data-testid={`${mode}-page`}>
      <div className="w-full max-w-[360px]">
        <Link to="/" className="font-pixel mb-6 flex items-center justify-center gap-2.5 text-[22px] font-semibold text-zinc-50">
          <Logo className="size-7" />
          Deja View
        </Link>
        <form onSubmit={submit} className="rounded-[3px] border border-zinc-50 bg-zinc-900 p-6 shadow-[4px_4px_0_0_var(--color-zinc-50)]" noValidate>
          <h1 className="font-pixel text-center text-[24px] font-semibold leading-tight text-zinc-50">{title}</h1>
          {upgrading && <p className="mt-1 text-center text-[13px] text-zinc-500">Your demo projects come with you.</p>}
          <div className="mt-5 space-y-3.5">
            {mode === "signup" && (
              <Field label="Name" hint="optional">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" data-testid="auth-name" />
              </Field>
            )}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus data-testid="auth-email" />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "8+ characters" : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                data-testid="auth-password"
              />
            </Field>
            {err && (
              <div className="rounded-[3px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert" data-testid="auth-error">
                {err}
              </div>
            )}
            <Button type="submit" variant="primary" className="w-full" loading={busy} data-testid="auth-submit">
              {mode === "login" ? "Sign in" : upgrading ? "Save my work" : "Sign up"}
            </Button>
          </div>
          {MOCK && mode === "login" && <p className="mt-3 text-center font-mono text-[11px] text-zinc-600">mock account: see MOCK_LOGIN in src/api/mock.ts</p>}
        </form>
        <div className="mt-5 space-y-3 text-center text-[13px] text-zinc-500">
          {mode === "login" ? (
            <p>
              New here?{" "}
              <Link to={`/signup${qs}`} className="font-medium text-accent-300 hover:underline" data-testid="to-signup">
                Create an account
              </Link>
            </p>
          ) : (
            <p>
              Have an account?{" "}
              <Link to={`/login${qs}`} className="font-medium text-accent-300 hover:underline" data-testid="to-login">
                Sign in
              </Link>
            </p>
          )}
          {!user && (
            <button type="button" onClick={start} disabled={demoBusy} className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-50" data-testid="auth-try-demo">
              <Sparkles className="size-3.5 text-accent-400" />
              {demoBusy ? "Starting…" : "Try the demo without an account"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
