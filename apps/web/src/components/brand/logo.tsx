import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <span className="bg-gradient-to-r from-indigo-700 to-violet-700 bg-clip-text text-lg text-transparent">
        RAG Agent
      </span>
    </Link>
  );
}
