"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  fetchEmbedMessages,
  getOrCreateVisitorId,
  getStoredConversationId,
  setStoredConversationId,
  streamEmbedChatSse,
  type EmbedMessage,
} from "@/lib/embed";

type ChatEvent =
  | { type: "token"; value: string }
  | { type: "done"; conversationId: string }
  | { type: "conversation"; conversationId: string }
  | { type: "error"; code?: string; message?: string };

type UiMessage = EmbedMessage & { localOnly?: boolean };

function TypingLoader() {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        aria-label="Assistant is typing"
        role="status"
      >
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      type="button"
      onClick={() => void copy()}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function EmbedChatInner() {
  const params = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId;
  const embedKey = searchParams.get("key") ?? "";

  const [visitorId, setVisitorId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, busy, scrollToBottom]);

  useEffect(() => {
    const vid = getOrCreateVisitorId(workspaceId);
    setVisitorId(vid);
    const storedConv = getStoredConversationId(workspaceId);
    if (storedConv) setConversationId(storedConv);
  }, [workspaceId]);

  useEffect(() => {
    if (!embedKey || !visitorId) {
      setLoadingHistory(false);
      return;
    }
    const conv = conversationId ?? getStoredConversationId(workspaceId);
    if (!conv) {
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchEmbedMessages({
          workspaceId,
          embedKey,
          visitorId,
          conversationId: conv,
        });
        if (!cancelled) setMessages(rows);
      } catch {
        /* keep empty history on load failure */
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, embedKey, visitorId, conversationId]);

  function rememberConversation(id: string) {
    setConversationId(id);
    setStoredConversationId(workspaceId, id);
  }

  async function send() {
    if (!message.trim() || !embedKey || !visitorId) return;
    const userText = message.trim();
    const userMsg: UiMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: userText,
      localOnly: true,
    };
    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    setBusy(true);
    setStreaming("");

    let activeConv = conversationId;
    let assistantText = "";
    try {
      await streamEmbedChatSse({
        workspaceId,
        embedKey,
        visitorId,
        message: userText,
        conversationId,
        onEvent: (evt) => {
          const e = evt as ChatEvent;
          if (e.type === "conversation") {
            activeConv = e.conversationId;
            rememberConversation(e.conversationId);
          }
          if (e.type === "token") {
            assistantText += e.value;
            setStreaming(assistantText);
          }
          if (e.type === "done") {
            activeConv = e.conversationId;
            rememberConversation(e.conversationId);
          }
          if (e.type === "error") {
            assistantText += `\n[error] ${e.message ?? e.code ?? "unknown"}`;
            setStreaming(assistantText);
          }
        },
      });
      if (activeConv) {
        const rows = await fetchEmbedMessages({
          workspaceId,
          embedKey,
          visitorId,
          conversationId: activeConv,
        });
        setMessages(rows);
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : "Chat request failed";
      setMessages((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          content: `[error] ${text}`,
          localOnly: true,
        },
      ]);
    } finally {
      setStreaming("");
      setBusy(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setConversationId(undefined);
    setStreaming("");
    if (typeof window !== "undefined") {
      localStorage.removeItem(`rag_conversation_${workspaceId}`);
    }
  }

  if (!embedKey) {
    return (
      <main className="flex h-full items-center justify-center p-4 text-sm text-slate-600">
        Missing embed key.
      </main>
    );
  }

  const showEmpty =
    !loadingHistory && messages.length === 0 && !streaming && !busy;

  return (
    <main className="flex h-full min-h-[100dvh] flex-col bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold text-slate-900">Chat</h1>
          <p className="text-xs text-slate-500">Answers from this site&apos;s knowledge base.</p>
        </div>
        {messages.length > 0 || conversationId ? (
          <button
            className="shrink-0 text-xs font-medium text-slate-600 hover:text-slate-900"
            type="button"
            onClick={startNewChat}
          >
            New chat
          </button>
        ) : null}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loadingHistory ? (
          <p className="text-sm text-slate-500">Loading history…</p>
        ) : showEmpty ? (
          <p className="text-sm text-slate-500">Ask a question about this website…</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" ? <CopyButton text={m.content} /> : null}
              </div>
            </div>
          ))
        )}
        {busy && !streaming ? <TypingLoader /> : null}
        {streaming ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800">
              <p className="whitespace-pre-wrap">{streaming}</p>
              {busy ? (
                <span className="mt-2 inline-flex items-center gap-0.5 text-slate-400" aria-hidden>
                  <span className="animate-pulse">.</span>
                  <span className="animate-pulse [animation-delay:200ms]">.</span>
                  <span className="animate-pulse [animation-delay:400ms]">.</span>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none ring-slate-900 focus:ring-2"
            placeholder="Type your message…"
            value={message}
            disabled={busy}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="shrink-0 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            type="button"
            disabled={busy || !visitorId}
            onClick={() => void send()}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function EmbedChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex h-full min-h-[100dvh] items-center justify-center text-sm text-slate-500">
          Loading…
        </main>
      }
    >
      <EmbedChatInner />
    </Suspense>
  );
}
