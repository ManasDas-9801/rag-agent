"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Shield } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { clearTokens, getSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export function AppShell({
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
  const onDashboard = pathname === "/dashboard";
  const isAdmin = getSessionUser()?.role === "admin";

  function logout() {
    clearTokens();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-mesh">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo href="/dashboard" />
          <nav className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                onDashboard
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Workspaces
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                  pathname.startsWith("/admin")
                    ? "bg-violet-50 text-violet-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {title ? (
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
            {subtitle ? <p className="mt-2 max-w-2xl text-slate-600">{subtitle}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
