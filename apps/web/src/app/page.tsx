import Link from "next/link";
import {
  ArrowRight,
  Code2,
  FileUp,
  MessageCircle,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

const features = [
  {
    icon: FileUp,
    title: "Upload your knowledge",
    description:
      "Add PDFs, DOCX, or text from your site. We chunk and index them automatically for semantic search.",
  },
  {
    icon: Code2,
    title: "Embed anywhere",
    description:
      "Copy one script tag — like Zendesk. Drop it on any HTML page and visitors get a chat bubble instantly.",
  },
  {
    icon: MessageCircle,
    title: "Grounded answers",
    description:
      "Replies use only your documents. Each workspace is isolated with its own ID and embed key.",
  },
  {
    icon: Shield,
    title: "Per-tenant security",
    description:
      "Separate workspaces, embed keys, and visitor sessions so customer data never mixes.",
  },
];

const steps = [
  { n: "1", title: "Sign up & create a workspace", body: "One workspace per site or customer." },
  { n: "2", title: "Upload your site PDF", body: "Ingestion runs in the background via the worker." },
  { n: "3", title: "Paste the embed snippet", body: "Visitors chat on your live site; you manage content in the dashboard." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center md:pt-24">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-4 py-1.5 text-sm font-medium text-indigo-700">
            <Sparkles className="h-4 w-4" />
            RAG-powered website assistant
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-slate-900 md:text-6xl md:leading-[1.1]">
            Turn your docs into a{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              chat widget
            </span>{" "}
            for any website
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Upload content, embed one line of code, and let visitors ask questions answered only from
            your knowledge base — not the open internet.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link className="btn-primary gap-2 px-8 py-3 text-base" href="/signup">
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className="btn-secondary gap-2 px-8 py-3 text-base" href="/login">
              Log in
            </Link>
          </div>
          <div className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-indigo-500/10">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="ml-2 text-xs text-slate-500">your-website.com</span>
            </div>
            <div className="grid gap-4 p-6 text-left md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Dashboard</p>
                <p className="mt-2 text-sm font-medium text-slate-800">Acme Support · 3 documents</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                </div>
                <p className="mt-1 text-xs text-emerald-600">Ready to embed</p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
                <div className="flex justify-end">
                  <span className="rounded-2xl bg-indigo-600 px-3 py-2 text-xs text-white">
                    What are your hours?
                  </span>
                </div>
                <div className="mt-3 max-w-[90%] rounded-2xl border border-white bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                  Based on your FAQ document, support is available Mon–Fri 9am–6pm IST.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-slate-200/80 bg-white py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold text-slate-900">Built for SaaS teams</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
              Everything you need to ship a trustworthy on-site assistant.
            </p>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="card-glass group p-6 transition hover:-translate-y-0.5 hover:shadow-2xl"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-mesh py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-3xl font-bold text-slate-900">How it works</h2>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="relative card-glass p-8">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200/80 bg-gradient-to-r from-indigo-600 to-violet-600 py-16">
          <div className="mx-auto max-w-3xl px-6 text-center text-white">
            <Zap className="mx-auto h-10 w-10 opacity-90" />
            <h2 className="mt-4 text-3xl font-bold">Ready to add AI chat to your site?</h2>
            <p className="mt-3 text-indigo-100">
              Create an account, upload a PDF, and paste the embed code in under five minutes.
            </p>
            <Link
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-indigo-50"
              href="/signup"
            >
              Create your workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
