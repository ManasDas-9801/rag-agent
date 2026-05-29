"use client";

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "@/components/app/admin-shell";
import { cn } from "@/lib/utils";

type AdminUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  plan: "free" | "pro" | "business";
  planLabel: string;
  createdAt: string;
  ownedWorkspaces: number;
  documents: number;
  storageMb: number;
  embedMessagesThisMonth: number;
  limits: {
    maxWorkspaces: number;
    maxDocumentsPerWorkspace: number;
    maxStorageMb: number;
    maxEmbedMessagesPerMonth: number;
  };
};

function pct(used: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const res = await adminFetch("/v1/admin/users");
    if (res.ok) setUsers((await res.json()) as AdminUser[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateUser(userId: string, patch: { role?: "user" | "admin"; plan?: string }) {
    setSavingId(userId);
    try {
      const res = await adminFetch(`/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) await load();
      else alert("Update failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminShell
      title="Users & plans"
      subtitle="Change subscription plan and platform role for any registered user."
    >
      {!users ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((u) => (
            <div key={u.id} className="card-glass p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{u.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Joined {new Date(u.createdAt).toLocaleDateString()} · {u.id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm">
                    <span className="text-slate-500">Plan</span>
                    <select
                      className="ml-2 rounded-lg border border-slate-200 px-2 py-1"
                      value={u.plan}
                      disabled={savingId === u.id}
                      onChange={(e) =>
                        void updateUser(u.id, { plan: e.target.value })
                      }
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="business">Business</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="text-slate-500">Role</span>
                    <select
                      className="ml-2 rounded-lg border border-slate-200 px-2 py-1"
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) =>
                        void updateUser(u.id, {
                          role: e.target.value as "user" | "admin",
                        })
                      }
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Workspaces", used: u.ownedWorkspaces, max: u.limits.maxWorkspaces },
                  { label: "Documents", used: u.documents, max: u.limits.maxDocumentsPerWorkspace },
                  { label: "Storage MB", used: u.storageMb, max: u.limits.maxStorageMb },
                  {
                    label: "Embed msgs/mo",
                    used: u.embedMessagesThisMonth,
                    max: u.limits.maxEmbedMessagesPerMonth,
                  },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>{m.label}</span>
                      <span>
                        {m.used} / {m.max}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          pct(m.used, m.max) >= 90 ? "bg-amber-500" : "bg-indigo-500",
                        )}
                        style={{ width: `${pct(m.used, m.max)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
