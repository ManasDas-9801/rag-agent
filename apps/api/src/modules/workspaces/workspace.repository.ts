import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid";
import type { Db } from "../../infra/db/client.js";
import * as schema from "../../infra/db/schema.js";
import {
  workspaceMembers,
  workspaces,
  type Workspace,
} from "../../infra/db/schema.js";

type TxDb = NodePgDatabase<typeof schema>;

export class WorkspaceRepository {
  constructor(private readonly db: Db) {}

  async createWithOwner(input: { name: string; slug: string; ownerId: string }) {
    return this.db.transaction(async (tx: TxDb) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({ name: input.name, slug: input.slug })
        .returning();
      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: input.ownerId,
        role: "owner",
      });
      return ws;
    });
  }

  async findById(id: string) {
    return this.db.query.workspaces.findFirst({
      where: eq(workspaces.id, id),
    });
  }

  async findMembership(workspaceId: string, userId: string) {
    return this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    });
  }

  async listForUser(userId: string) {
    return this.db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId));
  }

  slugCandidate(name: string) {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return `${base || "ws"}-${nanoid(8)}`;
  }

  toPublic(ws: Workspace) {
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    };
  }

  newEmbedPublicKey() {
    return randomBytes(24).toString("base64url");
  }

  async ensureEmbedKey(workspaceId: string) {
    const ws = await this.findById(workspaceId);
    if (!ws) return null;
    if (ws.embedPublicKey) return ws;
    const embedPublicKey = this.newEmbedPublicKey();
    const [updated] = await this.db
      .update(workspaces)
      .set({ embedPublicKey, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    return updated ?? null;
  }

  async rotateEmbedKey(workspaceId: string) {
    const embedPublicKey = this.newEmbedPublicKey();
    const [updated] = await this.db
      .update(workspaces)
      .set({ embedPublicKey, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    return updated ?? null;
  }

  async findByEmbedAuth(workspaceId: string, embedKey: string) {
    return this.db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), eq(workspaces.embedPublicKey, embedKey)),
    });
  }
}
