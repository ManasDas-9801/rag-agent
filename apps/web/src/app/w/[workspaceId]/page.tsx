"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { apiFetch, getAccessToken } from "@/lib/session";
import { cn } from "@/lib/utils";

type DocumentRow = {
  id: string;
  filename: string;
  status: "pending" | "processing" | "completed" | "failed";
  ingestion: { stage?: string; percent?: number } | null;
};

type EmbedConfig = {
  workspaceId: string;
  embedKey: string;
  apiUrl: string;
  widgetOrigin: string;
  snippet: string;
};

function statusColor(status: DocumentRow["status"]) {
  if (status === "completed") return "text-emerald-600 bg-emerald-50";
  if (status === "failed") return "text-red-600 bg-red-50";
  if (status === "processing") return "text-amber-600 bg-amber-50";
  return "text-slate-600 bg-slate-100";
}

export default function WorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const workspaceId = params.workspaceId;

  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [embed, setEmbed] = useState<EmbedConfig | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    async function loadDocuments() {
      const res = await apiFetch(`/v1/workspaces/${workspaceId}/documents`);
      if (cancelled) return;
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.ok) setDocuments((await res.json()) as DocumentRow[]);
    }
    async function loadEmbed() {
      const res = await apiFetch(`/v1/workspaces/${workspaceId}/embed`);
      if (cancelled) return;
      if (res.ok) {
        setEmbed((await res.json()) as EmbedConfig);
        setEmbedError(null);
      } else {
        setEmbedError("Could not load embed code");
      }
    }
    void loadDocuments();
    void loadEmbed();
    const pollId = window.setInterval(() => void loadDocuments(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [router, workspaceId]);

  function clearPendingFile() {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onUpload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await apiFetch(`/v1/workspaces/${workspaceId}/documents/upload`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      alert("Upload failed");
      return false;
    }
    const res2 = await apiFetch(`/v1/workspaces/${workspaceId}/documents`);
    if (res2.ok) setDocuments((await res2.json()) as DocumentRow[]);
    return true;
  }

  async function submitPendingUpload() {
    if (!pendingFile) return;
    setUploadBusy(true);
    try {
      const ok = await onUpload(pendingFile);
      if (ok) clearPendingFile();
    } finally {
      setUploadBusy(false);
    }
  }

  async function removeDocument(documentId: string, filename: string) {
    if (!window.confirm(`Remove “${filename}” from this workspace?`)) return;
    setDeletingId(documentId);
    try {
      const res = await apiFetch(`/v1/workspaces/${workspaceId}/documents/${documentId}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        alert("Could not remove document");
        return;
      }
      const res2 = await apiFetch(`/v1/workspaces/${workspaceId}/documents`);
      if (res2.ok) setDocuments((await res2.json()) as DocumentRow[]);
    } finally {
      setDeletingId(null);
    }
  }

  async function rotateEmbedKey() {
    if (!window.confirm("Rotate embed key? Old snippets on live sites will stop working.")) return;
    setRotatingKey(true);
    try {
      const res = await apiFetch(`/v1/workspaces/${workspaceId}/embed/rotate-key`, {
        method: "POST",
      });
      if (res.ok) setEmbed((await res.json()) as EmbedConfig);
      else alert("Could not rotate key");
    } finally {
      setRotatingKey(false);
    }
  }

  function copySnippet() {
    if (!embed?.snippet) return;
    void navigator.clipboard.writeText(embed.snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const completedCount = documents?.filter((d) => d.status === "completed").length ?? 0;

  return (
    <AppShell
      title="Workspace"
      subtitle="Upload knowledge, then deploy the chat widget on any website."
    >
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-indigo-600"
      >
        <ChevronLeft className="h-4 w-4" />
        All workspaces
      </Link>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="card-glass p-5">
          <p className="text-sm text-slate-500">Documents</p>
          <p className="mt-1 text-2xl font-bold">{documents?.length ?? "—"}</p>
        </div>
        <div className="card-glass p-5">
          <p className="text-sm text-slate-500">Ready for chat</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{completedCount}</p>
        </div>
        <div className="card-glass flex items-center p-5">
          <p className="text-sm text-slate-600">
            Run <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run worker</code>{" "}
            while ingesting.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="card-glass p-6">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Knowledge base</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">PDF, DOCX, TXT, or Markdown.</p>

          <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 px-6 py-10 transition hover:border-indigo-400 hover:bg-indigo-50">
            <Upload className="h-10 w-10 text-indigo-400" />
            <span className="mt-3 text-sm font-medium text-indigo-700">Choose file to upload</span>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPendingFile(f);
              }}
            />
          </label>

          {pendingFile ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-8 w-8 shrink-0 text-indigo-500" />
                <p className="truncate text-sm font-medium">{pendingFile.name}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-secondary px-3 py-1.5 text-xs" type="button" onClick={clearPendingFile}>
                  Remove
                </button>
                <button
                  className="btn-primary px-3 py-1.5 text-xs"
                  type="button"
                  disabled={uploadBusy}
                  onClick={() => void submitPendingUpload()}
                >
                  {uploadBusy ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 space-y-2">
            {!documents ? (
              <p className="text-sm text-slate-500">Loading documents…</p>
            ) : documents.length === 0 ? (
              <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">
                No documents yet. Upload a file to power the widget.
              </p>
            ) : (
              documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
                >
                  <FileText className="h-8 w-8 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.filename}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          statusColor(d.status),
                        )}
                      >
                        {d.status}
                      </span>
                      {d.ingestion?.percent != null ? (
                        <span className="text-xs text-slate-500">{d.ingestion.percent}%</span>
                      ) : null}
                    </div>
                    {d.status === "processing" && d.ingestion?.percent != null ? (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                          style={{ width: `${d.ingestion.percent}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    type="button"
                    disabled={deletingId === d.id}
                    onClick={() => void removeDocument(d.id, d.filename)}
                    aria-label="Remove document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card-glass p-6">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Embed widget</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Paste before <code className="text-xs">&lt;/body&gt;</code> on any site.
          </p>

          {embedError ? <p className="mt-4 text-sm text-red-600">{embedError}</p> : null}

          {embed ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
                <p className="break-all">
                  <span className="font-semibold text-slate-800">Workspace:</span> {embed.workspaceId}
                </p>
              </div>
              <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-indigo-100">
                {embed.snippet}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary gap-2" type="button" onClick={copySnippet}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy snippet"}
                </button>
                <button
                  className="btn-secondary gap-2"
                  type="button"
                  disabled={rotatingKey}
                  onClick={() => void rotateEmbedKey()}
                >
                  <RefreshCw className={cn("h-4 w-4", rotatingKey && "animate-spin")} />
                  Rotate key
                </button>
                <a
                  className="btn-secondary gap-2"
                  href={`/embed/${embed.workspaceId}?key=${encodeURIComponent(embed.embedKey)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Preview chat
                </a>
              </div>
            </div>
          ) : !embedError ? (
            <div className="mt-8 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
