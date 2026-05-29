"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { apiUrl, setSessionUser, setTokens, type SessionUser } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`${apiUrl()}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Invalid credentials");
      return;
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
    };
    setTokens(data.accessToken, data.refreshToken);
    setSessionUser(data.user);
    router.push(data.user.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 p-12 text-white lg:flex">
        <Logo href="/" className="[&_span:last-child]:bg-none [&_span:last-child]:text-white" />
        <div>
          <h2 className="text-3xl font-bold leading-tight">Welcome back</h2>
          <p className="mt-4 max-w-md text-indigo-100">
            Manage workspaces, upload knowledge, and deploy embeddable chat to any website.
          </p>
        </div>
        <p className="text-sm text-indigo-200">© RAG Agent Platform</p>
      </div>

      <main className="flex flex-1 flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-md lg:hidden">
          <Logo href="/" />
        </div>
        <div className="card-glass mx-auto mt-8 w-full max-w-md p-8 lg:mt-0">
          <h1 className="text-2xl font-bold text-slate-900">Log in</h1>
          <p className="mt-2 text-sm text-slate-600">Access your admin dashboard.</p>
          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                className="input-field mt-1.5"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Password</label>
              <input
                className="input-field mt-1.5"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button className="btn-primary w-full py-3" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Continue"}
            </button>
          </form>
          <p className="mt-8 text-center text-sm text-slate-600">
            No account?{" "}
            <Link className="font-semibold text-indigo-600 hover:text-indigo-700" href="/signup">
              Sign up free
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
