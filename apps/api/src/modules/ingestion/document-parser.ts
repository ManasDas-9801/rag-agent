import fs from "node:fs/promises";
import { createRequire } from "node:module";
import mammoth from "mammoth";

const require = createRequire(import.meta.url);
// pdf-parse ships CommonJS; load via require for ESM compatibility
const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string; numpages: number }>;

export type ParsedDocument = {
  text: string;
  pages?: number;
};

export async function parseDocument(filePath: string, mime: string): Promise<ParsedDocument> {
  const buf = await fs.readFile(filePath);
  if (mime === "application/pdf") {
    const res = await pdfParse(buf);
    return { text: res.text.replace(/\u0000/g, ""), pages: res.numpages };
  }
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const res = await mammoth.extractRawText({ buffer: buf });
    return { text: res.value.replace(/\u0000/g, "") };
  }
  if (mime === "text/plain" || mime === "text/markdown") {
    return { text: buf.toString("utf8").replace(/\u0000/g, "") };
  }
  const err = new Error("Unsupported document for parsing");
  (err as NodeJS.ErrnoException).code = "UNSUPPORTED_MEDIA";
  throw err;
}

export function cleanText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
