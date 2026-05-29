import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">RAG Agent Platform</h1>
        <p className="mt-2 text-slate-600">
          Sign in to create workspaces, upload documents, and chat with grounded answers.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
          href="/login"
        >
          Log in
        </Link>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50"
          href="/signup"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
