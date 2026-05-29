"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch, getAccessToken } from "@/lib/session";

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
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
          <h1 className="text-2xl font-semibold">Knowledge base & embed</h1>
          <p className="text-sm text-slate-600">
            Upload your site PDF, then paste the script on any website. Each workspace has its own
            ID and key so answers stay isolated.
          </p>
        </div>
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/dashboard">
          ← Back
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="text-lg font-semibold">Documents</h2>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <label className="text-sm font-medium text-slate-700">
              <span className="inline-block rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
                Choose file
              </span>
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
              <div className="flex max-w-full flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:items-end">
                <p className="truncate text-sm text-slate-800" title={pendingFile.name}>
                  {pendingFile.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    type="button"
                    disabled={uploadBusy}
                    onClick={clearPendingFile}
                  >
                    Remove
                  </button>
                  <button
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    type="button"
                    disabled={uploadBusy}
                    onClick={() => void submitPendingUpload()}
                  >
                    {uploadBusy ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-500">
            Status updates every few seconds. Ingestion requires{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">npm run worker</code>.
          </p>
          {!documents ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-600">No documents yet. Upload a PDF to power the widget.</p>
          ) : (
            documents.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.filename}</p>
                  <p className="text-xs text-slate-500">
                    {d.status}
                    {d.ingestion?.stage ? ` · ${d.ingestion.stage}` : ""}
                    {d.ingestion?.percent != null ? ` · ${d.ingestion.percent}%` : ""}
                  </p>
                </div>
                <button
                  className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  type="button"
                  disabled={deletingId === d.id}
                  onClick={() => void removeDocument(d.id, d.filename)}
                >
                  {deletingId === d.id ? "…" : "Remove"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Embed on your website</h2>
        <p className="mt-1 text-sm text-slate-600">
          Like Zendesk: paste this before <code className="text-xs">&lt;/body&gt;</code> on any HTML
          page. Visitors get a chat bubble; answers come only from this workspace&apos;s documents.
        </p>
        {embedError ? <p className="mt-2 text-sm text-red-600">{embedError}</p> : null}
        {embed ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                <span className="font-medium text-slate-800">Workspace ID:</span> {embed.workspaceId}
              </p>
              <p className="mt-1 break-all">
                <span className="font-medium text-slate-800">Embed key:</span> {embed.embedKey}
              </p>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs text-slate-100">
              {embed.snippet}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                type="button"
                onClick={copySnippet}
              >
                Copy snippet
              </button>
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                type="button"
                disabled={rotatingKey}
                onClick={() => void rotateEmbedKey()}
              >
                {rotatingKey ? "Rotating…" : "Rotate key"}
              </button>
              <a
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                href={`/embed/${embed.workspaceId}?key=${encodeURIComponent(embed.embedKey)}`}
                target="_blank"
                rel="noreferrer"
              >
                Preview widget
              </a>
            </div>
          </div>
        ) : !embedError ? (
          <p className="mt-3 text-sm text-slate-600">Loading embed code…</p>
        ) : null}
      </section>
    </main>
  );
}
