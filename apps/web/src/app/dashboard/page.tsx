"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, clearTokens, getAccessToken } from "@/lib/session";

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
    setError(null);
    const res = await apiFetch("/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError("Could not create workspace");
      return;
    }
    const ws = (await res.json()) as Workspace;
    setName("");
    setItems((prev) => (prev ? [ws, ...prev] : [ws]));
  }

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  if (!items) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
        <p className="text-sm text-slate-600">Loading workspaces…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workspaces</h1>
          <p className="text-sm text-slate-600">Upload documents and open a chat thread.</p>
        </div>
        <button
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
          type="button"
          onClick={logout}
        >
          Log out
        </button>
      </header>

      <form className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={createWorkspace}>
        <label className="text-sm font-medium text-slate-700">New workspace</label>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none ring-slate-900 focus:ring-2"
            placeholder="Acme Legal"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            required
          />
          <button
            className="rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            type="submit"
          >
            Create
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </form>

      <div className="grid gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-600">No workspaces yet. Create one above.</p>
        ) : (
          items.map((ws) => (
            <Link
              key={ws.id}
              href={`/w/${ws.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
            >
              <div>
                <p className="font-medium">{ws.name}</p>
                <p className="text-xs text-slate-500">{ws.slug}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {ws.role}
              </span>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
