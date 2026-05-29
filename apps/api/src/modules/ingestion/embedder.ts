import { GoogleGenerativeAI, TaskType, type EmbedContentRequest } from "@google/generative-ai";
import OpenAI from "openai";
import type { AppConfig } from "../../config/env.js";

export type EmbedPurpose = "document" | "query";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

/** Legacy embedding IDs no longer served on v1beta; map to current model. */
export function resolveGeminiEmbeddingModelId(configured: string): string {
  const m = configured.trim().replace(/^models\//, "");
  if (m === "text-embedding-004" || m === "embedding-001") {
    return "gemini-embedding-001";
  }
  return m;
}

export class Embedder {
  private readonly openai: OpenAI | null;
  private readonly gemini: GoogleGenerativeAI | null;

  constructor(private readonly cfg: AppConfig) {
    this.openai =
      cfg.AI_PROVIDER === "openai" ? new OpenAI({ apiKey: cfg.OPENAI_API_KEY }) : null;
    this.gemini =
      cfg.AI_PROVIDER === "gemini"
        ? new GoogleGenerativeAI(cfg.GEMINI_API_KEY)
        : null;
  }

  async embedBatch(
    texts: string[],
    purpose: EmbedPurpose = "document",
  ): Promise<number[][]> {
    if (this.cfg.AI_PROVIDER === "gemini") return this.embedGemini(texts, purpose);
    return this.embedOpenAI(texts);
  }

  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    if (!this.openai) throw new Error("OpenAI embedder not configured");
    const out: number[][] = [];
    const batch = this.cfg.EMBEDDING_BATCH_SIZE;
    for (let i = 0; i < texts.length; i += batch) {
      const slice = texts.slice(i, i + batch);
      const vec = await this.withRetries(async () => {
        const request: OpenAI.Embeddings.EmbeddingCreateParams = {
          model: this.cfg.OPENAI_EMBEDDING_MODEL,
          input: slice,
        };
        if (this.cfg.OPENAI_EMBEDDING_MODEL.startsWith("text-embedding-3")) {
          request.dimensions = this.cfg.EMBEDDING_DIMENSIONS;
        }
        const res = await this.openai!.embeddings.create(request);
        return res.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding as number[]);
      });
      out.push(...vec);
      if (i + batch < texts.length) await sleep(50);
    }
    return out;
  }

  private async embedGemini(
    texts: string[],
    purpose: EmbedPurpose,
  ): Promise<number[][]> {
    if (!this.gemini) throw new Error("Gemini embedder not configured");
    const modelId = resolveGeminiEmbeddingModelId(this.cfg.GEMINI_EMBEDDING_MODEL);
    const model = this.gemini.getGenerativeModel({ model: modelId });
    const taskType =
      purpose === "query" ? TaskType.RETRIEVAL_QUERY : TaskType.RETRIEVAL_DOCUMENT;
    const dim = this.cfg.EMBEDDING_DIMENSIONS;
    const out: number[][] = [];
    const parallel = Math.min(16, Math.max(1, this.cfg.EMBEDDING_BATCH_SIZE));
    for (let i = 0; i < texts.length; i += parallel) {
      const slice = texts.slice(i, i + parallel);
      const vec = await this.withRetriesGemini(async () => {
        const results = await Promise.all(
          slice.map((text) =>
            model.embedContent({
              content: { role: "user", parts: [{ text }] },
              taskType,
              outputDimensionality: dim,
            } as EmbedContentRequest & { outputDimensionality: number }),
          ),
        );
        return results.map((r) => [...r.embedding.values]);
      });
      out.push(...vec);
      if (i + parallel < texts.length) await sleep(80);
    }
    return out;
  }

  private async withRetries<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
    let last: unknown;
    for (let a = 1; a <= attempts; a++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        const status = (e as { status?: number }).status;
        const retriable = status === 429 || (status !== undefined && status >= 500);
        if (!retriable || a === attempts) break;
        await sleep(Math.min(10_000, 500 * 2 ** a));
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  private async withRetriesGemini<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
    let last: unknown;
    for (let a = 1; a <= attempts; a++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        const msg = e instanceof Error ? e.message : "";
        const status = (e as { status?: number }).status;
        const clientError =
          status === 400 ||
          status === 404 ||
          msg.includes("[404") ||
          msg.includes("[400");
        if (clientError) break;
        const retriable =
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("503") ||
          msg.includes("UNAVAILABLE");
        if (!retriable || a === attempts) break;
        await sleep(Math.min(10_000, 500 * 2 ** a));
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }
}
