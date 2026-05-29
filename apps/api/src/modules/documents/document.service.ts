import fs from "node:fs/promises";
import path from "node:path";
import { lookup } from "mime-types";
import type { Queue } from "bullmq";
import type { AppConfig } from "../../config/env.js";
import type { DocumentRepository } from "./document.repository.js";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

export class DocumentService {
  constructor(
    private readonly cfg: AppConfig,
    private readonly documents: DocumentRepository,
    private readonly ingestionQueue: Queue<{ documentId: string }>,
  ) {}

  private assertMime(filename: string, declared?: string) {
    const guessed = lookup(filename) || declared;
    const mime = (declared && ALLOWED_MIME.has(declared) ? declared : guessed) as string | false;
    if (!mime || !ALLOWED_MIME.has(mime)) {
      const err = new Error("Unsupported file type");
      (err as NodeJS.ErrnoException).code = "UNSUPPORTED_MEDIA";
      throw err;
    }
    return mime;
  }

  async saveUpload(params: {
    workspaceId: string;
    filename: string;
    buffer: Buffer;
    declaredMime?: string;
  }) {
    const maxBytes = this.cfg.MAX_UPLOAD_MB * 1024 * 1024;
    if (params.buffer.byteLength > maxBytes) {
      const err = new Error("File too large");
      (err as NodeJS.ErrnoException).code = "PAYLOAD_TOO_LARGE";
      throw err;
    }
    const mime = this.assertMime(params.filename, params.declaredMime);
    const doc = await this.documents.create({
      workspaceId: params.workspaceId,
      filename: params.filename,
      mimeType: mime,
      byteSize: params.buffer.byteLength,
      storagePath: "",
      chunkSize: this.cfg.CHUNK_SIZE,
      chunkOverlap: this.cfg.CHUNK_OVERLAP,
      status: "pending",
    });
    const dir = path.join(this.cfg.UPLOAD_DIR, params.workspaceId);
    await fs.mkdir(dir, { recursive: true });
    const storagePath = path.join(dir, doc.id);
    await fs.writeFile(storagePath, params.buffer);
    await this.documents.updateIngestion(doc.id, {
      storagePath,
      ingestion: { stage: "queued", percent: 0 },
    });
    await this.ingestionQueue.add(
      "ingest",
      { documentId: doc.id },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return doc.id;
  }

  /** Removes DB row (cascades chunks) and deletes the stored file when present. */
  async deleteWorkspaceDocument(params: { workspaceId: string; documentId: string }) {
    const doc = await this.documents.findById(params.documentId);
    if (!doc || doc.workspaceId !== params.workspaceId) return false;
    const storagePath = doc.storagePath;
    const ok = await this.documents.deleteByIdForWorkspace(params.documentId, params.workspaceId);
    if (ok && storagePath) {
      try {
        await fs.unlink(storagePath);
      } catch {
        // ignore missing file or races with the ingestion worker
      }
    }
    return ok;
  }
}
