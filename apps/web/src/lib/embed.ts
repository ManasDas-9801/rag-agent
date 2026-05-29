const VISITOR_PREFIX = "rag_visitor_";
const CONVERSATION_PREFIX = "rag_conversation_";

export function getOrCreateVisitorId(workspaceId: string) {
  if (typeof window === "undefined") return "";
  const key = `${VISITOR_PREFIX}${workspaceId}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function getStoredConversationId(workspaceId: string) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${CONVERSATION_PREFIX}${workspaceId}`);
}

export function setStoredConversationId(workspaceId: string, conversationId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${CONVERSATION_PREFIX}${workspaceId}`, conversationId);
}

export function apiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export type EmbedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type EmbedWidgetConfig = {
  workspaceId: string;
  widgetSettings: {
    title?: string;
    primaryColor?: string;
    position?: "left" | "right";
  };
  allowedDomains: string[];
};

export async function fetchEmbedConfig(params: {
  workspaceId: string;
  embedKey: string;
  parentHost?: string;
}): Promise<EmbedWidgetConfig> {
  const q = new URLSearchParams({ embedKey: params.embedKey });
  if (params.parentHost) q.set("parentHost", params.parentHost);
  const res = await fetch(
    `${apiUrl()}/v1/embed/workspaces/${params.workspaceId}/config?${q}`,
  );
  if (!res.ok) {
    throw new Error(`Could not load widget config (${res.status})`);
  }
  return (await res.json()) as EmbedWidgetConfig;
}

export async function fetchEmbedMessages(params: {
  workspaceId: string;
  embedKey: string;
  visitorId: string;
  conversationId: string;
  parentHost?: string;
}): Promise<EmbedMessage[]> {
  const q = new URLSearchParams({
    workspaceId: params.workspaceId,
    embedKey: params.embedKey,
    visitorId: params.visitorId,
  });
  if (params.parentHost) q.set("parentHost", params.parentHost);
  const res = await fetch(
    `${apiUrl()}/v1/embed/conversations/${params.conversationId}/messages?${q}`,
  );
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Could not load chat history (${res.status})`);
  }
  return (await res.json()) as EmbedMessage[];
}

type EmbedChatEvent =
  | { type: "token"; value: string }
  | { type: "done"; conversationId: string }
  | { type: "conversation"; conversationId: string }
  | { type: "error"; code?: string; message?: string };

export async function streamEmbedChatSse(params: {
  workspaceId: string;
  embedKey: string;
  visitorId: string;
  message: string;
  conversationId?: string;
  parentHost?: string;
  onEvent: (evt: EmbedChatEvent) => void;
}) {
  const url = `${apiUrl()}/v1/embed/chat/stream`;
  const body = JSON.stringify({
    workspaceId: params.workspaceId,
    embedKey: params.embedKey,
    visitorId: params.visitorId,
    message: params.message,
    conversationId: params.conversationId,
    parentHost: params.parentHost,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.clone().text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new Error(
      detail ? `Chat failed (${res.status}): ${detail}` : `Chat failed (${res.status})`,
    );
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatchSseBlock = (block: string) => {
    const normalized = block.replace(/\r\n/g, "\n");
    for (const line of normalized.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice("data:".length).trim();
      if (!json || json === "[DONE]") continue;
      try {
        params.onEvent(JSON.parse(json) as EmbedChatEvent);
      } catch {
        /* ignore */
      }
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) dispatchSseBlock(part);
  }
  if (buffer.trim()) dispatchSseBlock(buffer);
}
