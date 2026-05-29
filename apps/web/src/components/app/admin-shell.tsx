"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Database, LayoutDashboard, LogOut, Shield, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import {
  apiFetch,
  clearTokens,
  fetchCurrentUser,
  getAccessToken,
  getSessionUser,
  type SessionUser,
} from "@/lib/session";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & plans", icon: Users },
  { href: "/admin/database", label: "Database", icon: Database },
];

export function AdminShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    const cached = getSessionUser();
    if (cached?.role === "admin") {
      setUser(cached);
      return;
    }
    void (async () => {
      const me = await fetchCurrentUser();
      if (!me || me.role !== "admin") {
        router.replace("/dashboard");
        return;
      }
      setUser(me);
    })();
  }, [router]);

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mesh">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Logo href="/admin" />
          <nav className="flex items-center gap-2">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                  pathname === href
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Workspaces
            </Link>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            {title ? (
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
            ) : null}
            {subtitle ? <p className="mt-2 text-slate-600">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
            <Shield className="h-4 w-4" />
            {user.email}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useAdminGuard() {
  const router = useRouter();
  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);
}

export async function adminFetch(path: string, init?: RequestInit) {
  const res = await apiFetch(path, init);
  if (res.status === 403) throw new Error("Admin access required");
  return res;
}
