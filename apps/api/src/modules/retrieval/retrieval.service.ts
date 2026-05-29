import type { DocumentRepository } from "../documents/document.repository.js";
import type { Embedder } from "../ingestion/embedder.js";
import { CosineDistanceReranker, type RetrievalHit, type Reranker } from "./reranker.js";

export class RetrievalService {
  private readonly reranker: Reranker;

  constructor(
    private readonly documents: DocumentRepository,
    private readonly embedder: Embedder,
    reranker?: Reranker,
  ) {
    this.reranker = reranker ?? new CosineDistanceReranker();
  }

  async retrieve(input: {
    workspaceId: string;
    query: string;
    topK?: number;
    rerankTop?: number;
    documentIds?: string[];
  }) {
    const [qEmb] = await this.embedder.embedBatch([input.query], "query");
    const pool = 20;
    const rows = await this.documents.vectorSearch({
      workspaceId: input.workspaceId,
      embedding: qEmb!,
      limit: pool,
      documentIds: input.documentIds,
    });
    const hits: RetrievalHit[] = rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      filename: r.filename,
      distance: Number(r.distance),
    }));
    const reranked = this.reranker.rerank(input.query, hits);
    const top = input.rerankTop ?? 8;
    const k = input.topK ?? top;
    return reranked.slice(0, Math.min(k, reranked.length));
  }
}
