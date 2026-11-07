import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, notifyProjectsChanged } from "../api/client";
import { Button, Dialog, Field, Input, Textarea, ViewportChips } from "./ui";
import { useToast } from "./Toast";
import { plural } from "../lib/format";

export function parsePaths(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("/") || /^https?:/.test(s) ? s : `/${s}`));
}

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [paths, setPaths] = useState("/\n/pricing\n/about");
  const [viewports, setViewports] = useState<number[]>([1280, 390]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Give the project a name.");
    if (!/^https?:\/\/.+/.test(baseUrl.trim())) return setErr("Base URL must start with http:// or https://");
    const ps = parsePaths(paths);
    if (!ps.length) return setErr("Add at least one path.");
    if (!viewports.length) return setErr("Pick at least one viewport.");
    setBusy(true);
    try {
      const p = await api.createProject({ name: name.trim(), base_url: baseUrl.trim().replace(/\/$/, ""), paths: ps, viewports });
      toast({ tone: "success", title: `Created ${p.name}` });
      notifyProjectsChanged();
      setName("");
      setBaseUrl("");
      onClose();
      navigate(`/projects/${p.id}?run=1`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const nPaths = parsePaths(paths).length;
  return (
    <Dialog open={open} onClose={onClose} title="New project" description="Sightline will screenshot every page at every viewport." testId="new-project-dialog">
      <form onSubmit={submit} className="space-y-4 px-5 py-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing site" data-testid="project-name" />
        </Field>
        <Field label="Base URL">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://example.com" className="font-mono" data-testid="project-base-url" />
        </Field>
        <Field label="Paths" hint={`one per line · ${plural(nPaths, "page")}`}>
          <Textarea rows={5} value={paths} onChange={(e) => setPaths(e.target.value)} data-testid="project-paths" />
        </Field>
        <Field label="Viewports" hint={`${nPaths * viewports.length} snapshots per build`}>
          <ViewportChips value={viewports} onChange={setViewports} />
        </Field>
        {err && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{err}</div>}
        <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} data-testid="create-project-submit">
            Create project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
