import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import {
  documents,
  usageEvents,
  users,
  workspaceMembers,
  workspaces,
} from "../../infra/db/schema.js";
import { getPlanLimits, type PlanId } from "../billing/plans.js";
import type { UserRepository } from "../users/user.repository.js";

export type AdminUserOverview = {
  id: string;
  email: string;
  role: "user" | "admin";
  plan: PlanId;
  planLabel: string;
  createdAt: Date;
  ownedWorkspaces: number;
  documents: number;
  storageMb: number;
  embedMessagesThisMonth: number;
  limits: ReturnType<typeof getPlanLimits>;
};

export class AdminService {
  constructor(
    private readonly db: Db,
    private readonly users: UserRepository,
  ) {}

  private monthStart() {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  async listUsersWithUsage(): Promise<AdminUserOverview[]> {
    const all = await this.users.listAll();
    const monthStart = this.monthStart();

    const result: AdminUserOverview[] = [];
    for (const user of all) {
      const [owned] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.role, "owner")),
        );

      const ownedIds = await this.db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.role, "owner")),
        );
      const wsIds = ownedIds.map((r) => r.workspaceId);

      let docCount = 0;
      let storageBytes = 0;
      let embedMessages = 0;

      if (wsIds.length > 0) {
        const [docStats] = await this.db
          .select({
            count: sql<number>`count(*)::int`,
            bytes: sql<number>`coalesce(sum(${documents.byteSize}), 0)::int`,
          })
          .from(documents)
          .where(inArray(documents.workspaceId, wsIds));

        docCount = docStats?.count ?? 0;
        storageBytes = docStats?.bytes ?? 0;

        const [msgStats] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(usageEvents)
          .where(
            and(
              inArray(usageEvents.workspaceId, wsIds),
              inArray(usageEvents.kind, ["embed_chat_completion"]),
              gte(usageEvents.createdAt, monthStart),
            ),
          );
        embedMessages = msgStats?.count ?? 0;
      }

      const planId =
        user.plan === "pro" || user.plan === "business" ? user.plan : "free";
      const limits = getPlanLimits(planId);

      result.push({
        id: user.id,
        email: user.email,
        role: user.role,
        plan: planId,
        planLabel: limits.label,
        createdAt: user.createdAt,
        ownedWorkspaces: owned?.count ?? 0,
        documents: docCount,
        storageMb: Math.round((storageBytes / (1024 * 1024)) * 10) / 10,
        embedMessagesThisMonth: embedMessages,
        limits,
      });
    }
    return result;
  }

  async platformStats() {
    const [userCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const [wsCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaces);
    const [docCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents);
    return {
      users: userCount?.count ?? 0,
      workspaces: wsCount?.count ?? 0,
      documents: docCount?.count ?? 0,
    };
  }

  async updateUser(
    userId: string,
    patch: { role?: "user" | "admin"; plan?: PlanId },
  ) {
    return this.users.updateAdminFields(userId, patch);
  }
}
