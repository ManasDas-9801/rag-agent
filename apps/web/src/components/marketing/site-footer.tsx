import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Logo href="/" />
        <p className="text-sm text-slate-500">
          Grounded AI chat for your website — upload docs, embed in minutes.
        </p>
      </div>
    </footer>
  );
}
