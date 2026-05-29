import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import type { AppConfig } from "../../config/env.js";
import type { Db } from "../../infra/db/client.js";
import { documents } from "../../infra/db/schema.js";
import { DocumentRepository } from "../documents/document.repository.js";
import { cleanText, parseDocument } from "./document-parser.js";
import { chunkText } from "./chunking.js";
import { Embedder } from "./embedder.js";

export async function processIngestionJob(
  cfg: AppConfig,
  db: Db,
  job: Job<{ documentId: string }>,
) {
  const docRepo = new DocumentRepository(db);
  const embedder = new Embedder(cfg);
  const documentId = job.data.documentId;
  const doc = await docRepo.findById(documentId);
  if (!doc) return;
  const attempts = job.attemptsMade ?? 0;
  await docRepo.updateIngestion(documentId, {
    status: "processing",
    ingestion: { stage: "parse", percent: 10, attempts },
  });
  try {
    const parsed = await parseDocument(doc.storagePath, doc.mimeType);
    const text = cleanText(parsed.text);
    if (!text) {
      throw new Error("Document contained no extractable text");
    }
    await docRepo.updateIngestion(documentId, {
      ingestion: { stage: "chunk", percent: 35, attempts },
    });
    const size = doc.chunkSize ?? cfg.CHUNK_SIZE;
    const overlap = doc.chunkOverlap ?? cfg.CHUNK_OVERLAP;
    const chunks = chunkText(text, size, overlap);
    await docRepo.updateIngestion(documentId, {
      ingestion: { stage: "embed", percent: 55, detail: `${chunks.length} chunks`, attempts },
    });
    await docRepo.deleteChunksForDocument(documentId);
    const embeddings = await embedder.embedBatch(chunks.map((c) => c.text));
    const rows = chunks.map((c, idx) => ({
      documentId,
      chunkIndex: c.index,
      content: c.text,
      metadata: {
        source: doc.filename,
        documentPages:
          doc.mimeType === "application/pdf" ? parsed.pages : undefined,
        charStart: c.charStart,
        charEnd: c.charEnd,
        createdAt: new Date().toISOString(),
      },
      embedding: embeddings[idx]!,
    }));
    await docRepo.insertChunks(rows);
    await docRepo.updateIngestion(documentId, {
      status: "completed",
      ingestion: { stage: "done", percent: 100, attempts },
      errorMessage: null,
    });
    await db.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, documentId));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await docRepo.updateIngestion(documentId, {
      status: "failed",
      ingestion: { stage: "failed", percent: 0, detail: message, attempts },
      errorMessage: message,
    });
    throw e;
  }
}
