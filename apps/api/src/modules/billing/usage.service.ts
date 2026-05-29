import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import {
  documents,
  usageEvents,
  workspaceMembers,
  workspaces,
  users,
} from "../../infra/db/schema.js";
import { getPlanLimits, type PlanId, type PlanLimits, PLANS } from "./plans.js";

export type WorkspaceUsageSnapshot = {
  plan: PlanLimits;
  workspaces: number;
  documents: number;
  storageBytes: number;
  storageMb: number;
  embedMessagesThisMonth: number;
};

export class UsageService {
  constructor(private readonly db: Db) {}

  private monthStart() {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  async getOwnerPlanForWorkspace(workspaceId: string): Promise<PlanId> {
    const owner = await this.db
      .select({ plan: users.plan })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")),
      )
      .limit(1);
    const plan = owner[0]?.plan ?? "free";
    return plan === "pro" || plan === "business" ? plan : "free";
  }

  async countUserOwnedWorkspaces(userId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, "owner")),
      );
    return row?.count ?? 0;
  }

  async getWorkspaceDocumentStats(workspaceId: string) {
    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${documents.byteSize}), 0)::int`,
      })
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId));
    return { count: row?.count ?? 0, storageBytes: row?.bytes ?? 0 };
  }

  async countEmbedMessagesThisMonth(workspaceId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.workspaceId, workspaceId),
          inArray(usageEvents.kind, ["embed_chat_completion"]),
          gte(usageEvents.createdAt, this.monthStart()),
        ),
      );
    return row?.count ?? 0;
  }

  async getWorkspaceUsage(workspaceId: string, userId: string): Promise<WorkspaceUsageSnapshot> {
    const planId = await this.getOwnerPlanForWorkspace(workspaceId);
    const plan = getPlanLimits(planId);
    const workspaces = await this.countUserOwnedWorkspaces(userId);
    const docStats = await this.getWorkspaceDocumentStats(workspaceId);
    const embedMessagesThisMonth = await this.countEmbedMessagesThisMonth(workspaceId);
    return {
      plan,
      workspaces,
      documents: docStats.count,
      storageBytes: docStats.storageBytes,
      storageMb: Math.round((docStats.storageBytes / (1024 * 1024)) * 10) / 10,
      embedMessagesThisMonth,
    };
  }

  async assertCanCreateWorkspace(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const plan = getPlanLimits(user?.plan);
    const count = await this.countUserOwnedWorkspaces(userId);
    if (count >= plan.maxWorkspaces) {
      throw limitError(
        "WORKSPACE_LIMIT",
        `Plan limit: ${plan.maxWorkspaces} workspace(s). Upgrade to add more.`,
      );
    }
  }

  async assertCanUpload(workspaceId: string, fileBytes: number) {
    const planId = await this.getOwnerPlanForWorkspace(workspaceId);
    const plan = getPlanLimits(planId);
    const maxFile = plan.maxUploadMb * 1024 * 1024;
    if (fileBytes > maxFile) {
      throw limitError(
        "UPLOAD_TOO_LARGE",
        `File exceeds ${plan.maxUploadMb} MB limit for ${plan.label} plan.`,
      );
    }
    const stats = await this.getWorkspaceDocumentStats(workspaceId);
    if (stats.count >= plan.maxDocumentsPerWorkspace) {
      throw limitError(
        "DOCUMENT_LIMIT",
        `Plan limit: ${plan.maxDocumentsPerWorkspace} documents per workspace.`,
      );
    }
    const maxStorage = plan.maxStorageMb * 1024 * 1024;
    if (stats.storageBytes + fileBytes > maxStorage) {
      throw limitError(
        "STORAGE_LIMIT",
        `Plan storage limit: ${plan.maxStorageMb} MB. Remove files or upgrade.`,
      );
    }
  }

  async assertCanEmbedChat(workspaceId: string) {
    const planId = await this.getOwnerPlanForWorkspace(workspaceId);
    const plan = getPlanLimits(planId);
    const used = await this.countEmbedMessagesThisMonth(workspaceId);
    if (used >= plan.maxEmbedMessagesPerMonth) {
      throw limitError(
        "MESSAGE_LIMIT",
        `Monthly embed message limit (${plan.maxEmbedMessagesPerMonth}) reached for ${plan.label} plan.`,
      );
    }
  }

  listPlans() {
    return Object.values(PLANS);
  }
}

function limitError(code: string, message: string) {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}
