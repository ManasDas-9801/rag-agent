import { sql } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";

/** Application tables safe to browse from the admin UI (read-only). */
const ALLOWED_TABLES = new Set([
  "users",
  "workspaces",
  "workspace_members",
  "documents",
  "document_chunks",
  "conversations",
  "messages",
  "usage_events",
  "refresh_tokens",
]);

const SENSITIVE_COLUMNS = new Set([
  "password_hash",
  "token_hash",
  "embedding",
]);

function quoteIdent(name: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw Object.assign(new Error("Invalid table name"), { code: "INVALID_TABLE" });
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function maskValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_COLUMNS.has(column)) {
    if (column === "embedding") return "[vector]";
    return "[redacted]";
  }
  if (column === "embed_public_key" && typeof value === "string") {
    return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "[redacted]";
  }
  if (typeof value === "object") return value;
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

function maskRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = maskValue(k, v);
  }
  return out;
}

export class AdminDbService {
  constructor(private readonly db: Db) {}

  async listTables() {
    const rows = await this.db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = rows.rows
      .map((r) => r.table_name)
      .filter((name) => ALLOWED_TABLES.has(name));
    return tables;
  }

  async browseTable(table: string, limit = 50, offset = 0) {
    if (!ALLOWED_TABLES.has(table)) {
      const err = new Error("Table not allowed");
      (err as NodeJS.ErrnoException).code = "INVALID_TABLE";
      throw err;
    }
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const safeOffset = Math.max(offset, 0);
    const quoted = quoteIdent(table);

    const countRes = await this.db.execute<{ count: number }>(
      sql.raw(`SELECT count(*)::int AS count FROM ${quoted}`),
    );
    const total = countRes.rows[0]?.count ?? 0;

    const dataRes = await this.db.execute<Record<string, unknown>>(
      sql.raw(
        `SELECT * FROM ${quoted} ORDER BY 1 DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      ),
    );

    const rows = dataRes.rows.map((r) => maskRow(r));
    const columns =
      rows.length > 0 ? Object.keys(rows[0]!) : await this.getColumns(table);

    return { table, columns, rows, total, limit: safeLimit, offset: safeOffset };
  }

  private async getColumns(table: string) {
    const res = await this.db.execute<{ column_name: string }>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY ordinal_position
    `);
    return res.rows.map((r) => r.column_name);
  }
}
