"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, Plus } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { apiFetch, getAccessToken } from "@/lib/session";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
};

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<Workspace[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void (async () => {
      const res = await apiFetch("/v1/workspaces");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      setItems((await res.json()) as Workspace[]);
    })();
  }, [router]);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await apiFetch("/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (!res.ok) {
      setError("Could not create workspace");
      return;
    }
    const ws = (await res.json()) as Workspace;
    setName("");
    setItems((prev) => (prev ? [ws, ...prev] : [ws]));
  }

  if (!items) {
    return (
      <AppShell title="Your workspaces" subtitle="Loading…">
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Your workspaces"
      subtitle="Each workspace is a separate knowledge base and embed widget for one website or customer."
    >
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="card-glass p-5">
          <p className="text-sm font-medium text-slate-500">Workspaces</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{items.length}</p>
        </div>
        <div className="card-glass p-5 sm:col-span-2">
          <p className="text-sm text-slate-600">
            Upload documents → copy embed script → visitors get grounded answers on your site.
          </p>
        </div>
      </div>

      <form className="card-glass mb-8 p-6" onSubmit={createWorkspace}>
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-900">New workspace</h2>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="input-field flex-1"
            placeholder="e.g. Acme Support, My Portfolio Site"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            required
          />
          <button className="btn-primary shrink-0" type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create workspace"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.length === 0 ? (
          <div className="card-glass col-span-full flex flex-col items-center py-16 text-center">
            <FolderOpen className="h-12 w-12 text-slate-300" />
            <p className="mt-4 font-medium text-slate-800">No workspaces yet</p>
            <p className="mt-1 text-sm text-slate-500">Create one above to upload docs and get your embed code.</p>
          </div>
        ) : (
          items.map((ws) => (
            <Link
              key={ws.id}
              href={`/w/${ws.id}`}
              className="card-glass group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-500/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold capitalize text-indigo-700">
                  {ws.role}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900 group-hover:text-indigo-700">
                {ws.name}
              </h3>
              <p className="mt-1 truncate text-sm text-slate-500">{ws.slug}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
                Open workspace
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))
        )}
      </div>
    </AppShell>
  );
}
