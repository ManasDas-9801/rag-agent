import { and, desc, eq, type InferInsertModel } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import {
  conversations,
  documentChunks,
  documents,
  messages,
} from "../../infra/db/schema.js";

export class DocumentRepository {
  constructor(private readonly db: Db) {}

  async create(input: InferInsertModel<typeof documents>) {
    const [row] = await this.db.insert(documents).values(input).returning();
    return row;
  }

  async findById(id: string) {
    return this.db.query.documents.findFirst({
      where: eq(documents.id, id),
    });
  }

  async listByWorkspace(workspaceId: string) {
    return this.db
      .select()
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .orderBy(desc(documents.createdAt));
  }

  async deleteByIdForWorkspace(documentId: string, workspaceId: string): Promise<boolean> {
    const rows = await this.db
      .delete(documents)
      .where(and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId)))
      .returning({ id: documents.id });
    return rows.length > 0;
  }

  async updateIngestion(
    id: string,
    patch: Partial<{
      status: InferInsertModel<typeof documents>["status"];
      ingestion: InferInsertModel<typeof documents>["ingestion"];
      errorMessage: string | null;
      storagePath: string;
    }>,
  ) {
    await this.db
      .update(documents)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(documents.id, id));
  }

  async deleteChunksForDocument(documentId: string) {
    await this.db
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, documentId));
  }

  async insertChunks(
    rows: Array<{
      documentId: string;
      chunkIndex: number;
      content: string;
      metadata: InferInsertModel<typeof documentChunks>["metadata"];
      embedding: number[];
    }>,
  ) {
    if (!rows.length) return;
    await this.db.insert(documentChunks).values(
      rows.map((r) => ({
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        content: r.content,
        metadata: r.metadata ?? undefined,
        embedding: r.embedding,
      })),
    );
  }

  async vectorSearch(params: {
    workspaceId: string;
    embedding: number[];
    limit: number;
    documentIds?: string[];
  }): Promise<
    Array<{
      id: string;
      documentId: string;
      chunkIndex: number;
      content: string;
      metadata: unknown;
      filename: string;
      distance: string;
    }>
  > {
    const vectorLiteral = JSON.stringify(params.embedding);
    const pool = this.db.pool;
    const baseSql =
      "SELECT dc.id, " +
      'dc.document_id AS "documentId", ' +
      'dc.chunk_index AS "chunkIndex", ' +
      "dc.content, " +
      "dc.metadata, " +
      "d.filename, " +
      "(dc.embedding <=> $2::vector) AS distance " +
      "FROM document_chunks dc " +
      "INNER JOIN documents d ON d.id = dc.document_id " +
      "WHERE d.workspace_id = $1::uuid";
    const filterSql = params.documentIds?.length
      ? " AND d.id = ANY($4::uuid[])"
      : "";
    const query =
      baseSql +
      filterSql +
      " ORDER BY distance ASC LIMIT $3";
    const values: unknown[] = [
      params.workspaceId,
      vectorLiteral,
      params.limit,
    ];
    if (params.documentIds?.length) values.push(params.documentIds);
    const { rows } = await pool.query<{
      id: string;
      documentId: string;
      chunkIndex: number;
      content: string;
      metadata: unknown;
      filename: string;
      distance: string;
    }>(query, values);
    return rows;
  }
}

export class ConversationRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    workspaceId: string;
    userId?: string | null;
    visitorId?: string | null;
    title?: string | null;
  }) {
    const [row] = await this.db.insert(conversations).values(input).returning();
    return row;
  }

  async findById(id: string) {
    return this.db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    });
  }

  async findByIdForEmbed(conversationId: string, workspaceId: string, visitorId: string) {
    return this.db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.visitorId, visitorId),
      ),
    });
  }

  async list(workspaceId: string, userId: string) {
    return this.db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.workspaceId, workspaceId), eq(conversations.userId, userId)),
      )
      .orderBy(desc(conversations.updatedAt));
  }

  async touch(id: string) {
    await this.db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, id));
  }

  async addMessage(input: typeof messages.$inferInsert) {
    const [row] = await this.db.insert(messages).values(input).returning();
    return row;
  }

  async recentMessages(conversationId: string, limit: number) {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return rows.reverse();
  }
}
