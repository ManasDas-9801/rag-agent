export type RetrievalHit = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown> | null;
  filename: string;
  distance: number;
};

export interface Reranker {
  rerank(query: string, hits: RetrievalHit[]): RetrievalHit[];
}

export class CosineDistanceReranker implements Reranker {
  rerank(_query: string, hits: RetrievalHit[]) {
    return [...hits].sort(
      (a, b) => scoreFromCosineDistance(b.distance) - scoreFromCosineDistance(a.distance),
    );
  }
}

export function scoreFromCosineDistance(distance: number) {
  const d = Number(distance);
  if (!Number.isFinite(d)) return 0;
  return 1 - Math.min(1, d / 2);
}
