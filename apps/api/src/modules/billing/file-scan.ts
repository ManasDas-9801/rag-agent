/** Basic content inspection — not a substitute for antivirus in production. */

const PDF = Buffer.from("%PDF");
const ZIP_DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function startsWith(buf: Buffer, sig: Buffer) {
  return buf.length >= sig.length && buf.subarray(0, sig.length).equals(sig);
}

function looksLikeText(buf: Buffer) {
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) suspicious++;
    if (suspicious > 2) return false;
  }
  return true;
}

export function scanUploadBuffer(buf: Buffer, mime: string, filename: string): void {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf") {
    if (!startsWith(buf, PDF)) {
      throw scanError("FILE_REJECTED", "File content does not match PDF format");
    }
    return;
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    if (!startsWith(buf, ZIP_DOCX)) {
      throw scanError("FILE_REJECTED", "File content does not match DOCX format");
    }
    return;
  }
  if (mime === "text/plain" || mime === "text/markdown" || lower.endsWith(".txt") || lower.endsWith(".md")) {
    if (!looksLikeText(buf)) {
      throw scanError("FILE_REJECTED", "File contains binary content");
    }
  }
}

function scanError(code: string, message: string) {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}
