import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a className="transition hover:text-indigo-600" href="#features">
            Features
          </a>
          <a className="transition hover:text-indigo-600" href="#how-it-works">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            className="hidden text-sm font-medium text-slate-600 transition hover:text-indigo-600 sm:inline"
            href="/login"
          >
            Log in
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-500 hover:to-violet-500"
            href="/signup"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
