import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Copy, KeyRound, LogOut, Plus, Trash2, UserPlus } from "lucide-react";
import { api } from "../api/client";
import type { ApiToken, CreatedApiToken } from "../api/types";
import { useResource } from "../hooks/useResource";
import { initials, useAuth } from "../auth/auth";
import { useBreadcrumbs } from "../components/Layout";
import { Button, Dialog, ErrorBox, IconButton, Input, Skeleton, copyText } from "../components/ui";
import { useToast } from "../components/Toast";
import { timeAgo } from "../lib/format";

export function SettingsPage() {
  useBreadcrumbs([{ label: "Settings" }], []);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-9 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-pixel border-b border-zinc-800 pb-5 text-[26px] font-semibold leading-none text-zinc-50 sm:text-[32px]">Settings</h1>

      <Section title="Account">
        {user && (
          <div className="flex flex-wrap items-center gap-3 rounded-[3px] border border-zinc-800 bg-zinc-900 p-4" data-testid="account-card">
            <span className="flex size-9 items-center justify-center rounded-[3px] bg-zinc-50 font-mono text-xs font-semibold text-white">{initials(user)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-zinc-100">{user.is_guest ? "Guest" : user.name}</div>
              <div className="truncate text-xs text-zinc-500" data-testid="account-email">
                {user.email ?? "Guest session, not saved"}
              </div>
            </div>
            {user.is_guest && (
              <Button size="sm" variant="primary" icon={<UserPlus className="size-3.5" />} onClick={() => navigate("/signup?next=/settings")} data-testid="settings-signup">
                Sign up
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<LogOut className="size-3.5" />} onClick={signOut} data-testid="settings-sign-out">
              Sign out
            </Button>
          </div>
        )}
      </Section>

      <TokensSection />
      <CiSnippet />
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="app-eyebrow">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TokensSection() {
  const { toast } = useToast();
  const tokens = useResource(() => api.listTokens(), []);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const t = await api.createToken(name.trim());
      setCreated(t);
      setName("");
      void tokens.reload();
    } catch (e2) {
      toast({ tone: "error", title: "Couldn't create token", body: e2 instanceof Error ? e2.message : String(e2) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      await api.deleteToken(revoking.id);
      toast({ tone: "success", title: `Revoked ${revoking.name}` });
      if (created?.id === revoking.id) setCreated(null);
      setRevoking(null);
      void tokens.reload();
    } catch (e2) {
      toast({ tone: "error", title: "Couldn't revoke", body: e2 instanceof Error ? e2.message : String(e2) });
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <Section title="API tokens">
      <form onSubmit={create} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name, e.g. GitHub Actions" className="flex-1" data-testid="token-name" />
        <Button type="submit" variant="primary" icon={<Plus className="size-3.5" />} loading={busy} disabled={!name.trim()} data-testid="create-token">
          Create token
        </Button>
      </form>

      {created && <NewTokenReveal token={created} onDone={() => setCreated(null)} />}

      <div className="mt-3 overflow-hidden rounded-[3px] border border-zinc-800">
        {tokens.error && (
          <div className="p-3">
            <ErrorBox message={tokens.error} onRetry={tokens.reload} />
          </div>
        )}
        {!tokens.data && !tokens.error && (
          <div className="space-y-2 p-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        )}
        {tokens.data && tokens.data.length === 0 && (
          <div className="flex items-center gap-2.5 px-4 py-5 text-[13px] text-zinc-500" data-testid="tokens-empty">
            <KeyRound className="size-4" />
            No tokens yet
          </div>
        )}
        {tokens.data && tokens.data.length > 0 && (
          <table className="w-full text-left text-[13px]" data-testid="tokens-table">
            <thead className="border-b border-zinc-800 bg-zinc-900 text-[11px] text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Token</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Created</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {tokens.data.map((t) => (
                <tr key={t.id} data-testid="token-row">
                  <td className="max-w-[180px] truncate px-4 py-2.5 font-medium text-zinc-200">{t.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{t.prefix}</td>
                  <td className="hidden px-4 py-2.5 text-xs text-zinc-500 sm:table-cell" title={new Date(t.created_at).toLocaleString()}>
                    {timeAgo(t.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">{t.last_used_at ? timeAgo(t.last_used_at) : "Never"}</td>
                  <td className="px-2 py-2.5 text-right">
                    <IconButton label={`Revoke ${t.name}`} onClick={() => setRevoking(t)} className="hover:text-red-300" data-testid="revoke-token">
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!revoking} onClose={() => setRevoking(null)} title={`Revoke ${revoking?.name ?? "token"}?`} description="Anything using it stops working immediately." width="max-w-sm">
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="ghost" onClick={() => setRevoking(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={revokeBusy} onClick={revoke} data-testid="confirm-revoke" data-autofocus>
            Revoke
          </Button>
        </div>
      </Dialog>
    </Section>
  );
}

function NewTokenReveal({ token, onDone }: { token: CreatedApiToken; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-[3px] border border-amber-400/30 bg-amber-400/[0.06] p-4" data-testid="new-token">
      <div className="flex items-center gap-2 text-[13px] font-medium text-amber-200">
        <AlertTriangle className="size-4" />
        Copy it now. You won't see it again.
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-[3px] border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[12.5px] text-zinc-100" data-testid="new-token-value">
          {token.token}
        </code>
        <Button
          variant="secondary"
          icon={copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          onClick={async () => setCopied(await copyText(token.token))}
          data-testid="copy-token"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onDone} data-testid="token-done">
          Done
        </Button>
      </div>
    </div>
  );
}

function CiSnippet() {
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const snippet = `curl -s -X POST "${origin}/api/projects/$PROJECT_ID/runs" \\
  -H "Authorization: Bearer $DEJAVIEW_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"base_url": "https://pr-123.preview.example.com", "label": "PR #123"}'`;
  return (
    <Section
      title="Use in CI"
      aside={
        <Button size="sm" variant="ghost" icon={copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} onClick={async () => setCopied(await copyText(snippet))} data-testid="copy-ci-snippet">
          {copied ? "Copied" : "Copy"}
        </Button>
      }
    >
      <pre className="overflow-x-auto rounded-[3px] border border-zinc-800 bg-zinc-950 p-4 font-mono text-[12px] leading-relaxed text-zinc-300" data-testid="ci-snippet">
        {snippet}
      </pre>
      <p className="mt-2 text-xs text-zinc-500">
        Then poll <code className="font-mono text-zinc-400">GET /api/runs/{"{id}"}/status</code> until <code className="font-mono text-zinc-400">status</code> is <code className="font-mono text-zinc-400">done</code>.
      </p>
    </Section>
  );
}
