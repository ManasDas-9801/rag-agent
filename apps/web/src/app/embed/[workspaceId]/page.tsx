"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, MessageSquare, RotateCcw, Send, User } from "lucide-react";
import {
  fetchEmbedConfig,
  fetchEmbedMessages,
  getOrCreateVisitorId,
  getStoredConversationId,
  setStoredConversationId,
  streamEmbedChatSse,
  type EmbedMessage,
} from "@/lib/embed";
import { cn } from "@/lib/utils";

type ChatEvent =
  | { type: "token"; value: string }
  | { type: "done"; conversationId: string }
  | { type: "conversation"; conversationId: string }
  | { type: "error"; code?: string; message?: string };

type UiMessage = EmbedMessage & { localOnly?: boolean };

function TypingLoader() {
  return (
    <div className="flex justify-start gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div
        className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
        role="status"
        aria-label="Assistant is typing"
      >
        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
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
      className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
      type="button"
      onClick={() => void copy()}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function EmbedChatInner() {
  const params = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId;
  const embedKey = searchParams.get("key") ?? "";
  const hostFromQuery = searchParams.get("host")?.trim();
  const parentHost =
    hostFromQuery ||
    (typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : undefined);

  const [widgetTitle, setWidgetTitle] = useState("Support chat");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
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
    if (!embedKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await fetchEmbedConfig({
          workspaceId,
          embedKey,
          parentHost: parentHost ?? undefined,
        });
        if (cancelled) return;
        if (cfg.widgetSettings.title) setWidgetTitle(cfg.widgetSettings.title);
        if (cfg.widgetSettings.primaryColor) setPrimaryColor(cfg.widgetSettings.primaryColor);
      } catch {
        /* use defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, embedKey, parentHost]);

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
          parentHost: parentHost ?? undefined,
        });
        if (!cancelled) setMessages(rows);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, embedKey, visitorId, conversationId, parentHost]);

  function rememberConversation(id: string) {
    setConversationId(id);
    setStoredConversationId(workspaceId, id);
  }

  async function send() {
    if (!message.trim() || !embedKey || !visitorId) return;
    const userText = message.trim();
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${Date.now()}`, role: "user", content: userText, localOnly: true },
    ]);
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
        parentHost: parentHost ?? undefined,
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
          parentHost: parentHost ?? undefined,
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
      <main className="flex h-full min-h-[100dvh] items-center justify-center bg-slate-100 p-4 text-sm text-slate-600">
        Missing embed key.
      </main>
    );
  }

  const showEmpty =
    !loadingHistory && messages.length === 0 && !streaming && !busy;

  return (
    <main className="flex h-full min-h-[100dvh] flex-col bg-gradient-to-b from-slate-100 to-slate-50">
      <header
        className="shrink-0 px-4 py-4 text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, #7c3aed)` }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">{widgetTitle}</h1>
              <p className="text-xs text-white/80">Powered by your site knowledge</p>
            </div>
          </div>
          {(messages.length > 0 || conversationId) && (
            <button
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur transition hover:bg-white/25"
              type="button"
              onClick={startNewChat}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {loadingHistory ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : showEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md">
              <Bot className="h-7 w-7 text-indigo-500" />
            </div>
            <p className="mt-4 font-medium text-slate-800">How can we help?</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Ask anything about this website. Answers come from uploaded documents only.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex gap-2", m.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  m.role === "user"
                    ? "bg-slate-800 text-white"
                    : "bg-gradient-to-br from-indigo-500 to-violet-500 text-white",
                )}
              >
                {m.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "rounded-tr-md bg-slate-800 text-white"
                    : "rounded-tl-md border border-slate-200/80 bg-white text-slate-800",
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" ? <CopyButton text={m.content} /> : null}
              </div>
            </div>
          ))
        )}
        {busy && !streaming ? <TypingLoader /> : null}
        {streaming ? (
          <div className="flex gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-tl-md border border-slate-200/80 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm">
              <p className="whitespace-pre-wrap">{streaming}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-slate-200/80 bg-white p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20">
          <textarea
            className="max-h-28 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
            placeholder="Type your message…"
            rows={1}
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
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40"
            type="button"
            disabled={busy || !visitorId || !message.trim()}
            onClick={() => void send()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
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
        <main className="flex h-full min-h-[100dvh] items-center justify-center bg-slate-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </main>
      }
    >
      <EmbedChatInner />
    </Suspense>
  );
}
