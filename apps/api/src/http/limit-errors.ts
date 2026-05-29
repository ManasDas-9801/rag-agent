import type { FastifyReply } from "fastify";

const LIMIT_CODES = new Set([
  "WORKSPACE_LIMIT",
  "DOCUMENT_LIMIT",
  "STORAGE_LIMIT",
  "MESSAGE_LIMIT",
  "UPLOAD_TOO_LARGE",
]);

const FORBIDDEN_CODES = new Set(["ORIGIN_NOT_ALLOWED", "FILE_REJECTED"]);

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException).code;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}

/** @returns true if a response was sent */
export function replyIfLimitError(reply: FastifyReply, err: unknown): boolean {
  const code = errCode(err);
  if (!code) return false;

  if (LIMIT_CODES.has(code)) {
    void reply.code(402).send({ error: errMessage(err), code });
    return true;
  }
  if (FORBIDDEN_CODES.has(code)) {
    void reply.code(403).send({ error: errMessage(err), code });
    return true;
  }
  if (code === "UNSUPPORTED_MEDIA") {
    void reply.code(415).send({ error: errMessage(err), code });
    return true;
  }
  if (code === "PAYLOAD_TOO_LARGE") {
    void reply.code(413).send({ error: errMessage(err), code });
    return true;
  }
  if (code === "NOT_FOUND") {
    void reply.notFound(errMessage(err));
    return true;
  }
  return false;
}
