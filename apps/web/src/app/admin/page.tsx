"use client";

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "@/components/app/admin-shell";

type Stats = { users: number; workspaces: number; documents: number };

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await adminFetch("/v1/admin/stats");
      if (res.ok) setStats((await res.json()) as Stats);
    })();
  }, []);

  return (
    <AdminShell
      title="Super admin"
      subtitle="Platform overview. Manage users, plans, and browse the PostgreSQL database (read-only)."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-glass p-6">
          <p className="text-sm text-slate-500">Registered users</p>
          <p className="mt-2 text-3xl font-bold">{stats?.users ?? "—"}</p>
        </div>
        <div className="card-glass p-6">
          <p className="text-sm text-slate-500">Workspaces</p>
          <p className="mt-2 text-3xl font-bold">{stats?.workspaces ?? "—"}</p>
        </div>
        <div className="card-glass p-6">
          <p className="text-sm text-slate-500">Documents</p>
          <p className="mt-2 text-3xl font-bold">{stats?.documents ?? "—"}</p>
        </div>
      </div>

      <div className="card-glass mt-8 p-6 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-900">Make yourself super admin</h2>
        <p className="mt-2">
          After signing up, run from the repo root (replace with your email):
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-indigo-100">
          npm run admin:promote -- you@example.com
        </pre>
        <p className="mt-3">
          Optional plan:{" "}
          <code className="rounded bg-slate-100 px-1">npm run admin:promote -- you@example.com --plan=business</code>
        </p>
        <p className="mt-3">
          Or in PostgreSQL:{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">
            UPDATE users SET role = &apos;admin&apos;, plan = &apos;pro&apos; WHERE email = &apos;you@example.com&apos;;
          </code>
        </p>
        <p className="mt-3 text-xs text-slate-500">
          This app uses PostgreSQL (not MySQL). Use Database in the nav for a phpMyAdmin-style table browser,
          or install pgAdmin / DBeaver for full SQL access.
        </p>
      </div>
    </AdminShell>
  );
}
