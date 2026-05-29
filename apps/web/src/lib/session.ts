const ACCESS = "rag_access_token";
const REFRESH = "rag_refresh_token";

export function setTokens(access: string, refresh: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS);
}

export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH);
}

export function apiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiUrl()}${path}`, { ...init, headers });
  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetch(path, init, true);
    clearTokens();
  }
  return res;
}

export async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  const res = await fetch(`${apiUrl()}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function streamChatSse(params: {
  workspaceId: string;
  message: string;
  conversationId?: string;
  onEvent: (evt: unknown) => void;
}) {
  const url = `${apiUrl()}/v1/workspaces/${params.workspaceId}/chat/stream`;
  const body = JSON.stringify({
    message: params.message,
    conversationId: params.conversationId,
  });
  const post = (access: string | null) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body,
    });

  let access = getAccessToken();
  let res = await post(access);
  if (res.status === 401) {
    if (await refreshAccessToken()) {
      access = getAccessToken();
      res = await post(access);
    } else {
      clearTokens();
    }
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.clone().text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new Error(
      detail ? `Chat stream failed (${res.status}): ${detail}` : `Chat stream failed (${res.status})`,
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
        params.onEvent(JSON.parse(json));
      } catch {
        // ignore parse errors for keep-alives / partial frames
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
