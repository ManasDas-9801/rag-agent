/** Validate embed request origin against workspace allowlist. */

function normalizeHost(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    if (trimmed.includes("://")) {
      return new URL(trimmed).hostname.toLowerCase();
    }
    return trimmed.split(":")[0]!.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function extractRequestOrigin(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin) {
    return normalizeHost(origin);
  }
  const referer = req.headers.referer;
  if (typeof referer === "string" && referer) {
    try {
      return new URL(referer).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

export function isOriginAllowed(allowedDomains: string[] | null | undefined, requestHost: string | null) {
  const list = (allowedDomains ?? []).map((d) => normalizeHost(d)).filter(Boolean) as string[];
  if (list.length === 0) return true;
  if (!requestHost) return false;
  const host = requestHost.replace(/^www\./, "");
  return list.some((d) => {
    const allowed = d.replace(/^www\./, "");
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}
