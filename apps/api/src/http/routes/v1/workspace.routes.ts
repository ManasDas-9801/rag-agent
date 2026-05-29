import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { replyIfLimitError } from "../../limit-errors.js";
import type { UsageService } from "../../../modules/billing/usage.service.js";
import type { WorkspaceRepository } from "../../../modules/workspaces/workspace.repository.js";
import type { WorkspaceService } from "../../../modules/workspaces/workspace.service.js";
import type { Workspace } from "../../../infra/db/schema.js";
import { workspaceMembers } from "../../../infra/db/schema.js";

const createSchema = z.object({
  name: z.string().min(2).max(200),
});

const settingsSchema = z.object({
  allowedDomains: z.array(z.string().min(1).max(253)).max(50).optional(),
  widgetSettings: z
    .object({
      title: z.string().max(80).optional(),
      primaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Use hex color e.g. #4f46e5")
        .optional(),
      position: z.enum(["left", "right"]).optional(),
    })
    .optional(),
});

type WorkspaceMemberRole = (typeof workspaceMembers.$inferSelect)["role"];

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: {
    workspaces: WorkspaceRepository;
    workspaceService: WorkspaceService;
    usage: UsageService;
  },
) {
  app.post(
    "/v1/workspaces",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["workspaces"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", minLength: 2, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const userId = req.user.sub;
      try {
        const ws = await deps.workspaceService.create(userId, body.name);
        const membership = await deps.workspaces.findMembership(ws.id, userId);
        return {
          ...deps.workspaces.toPublic(ws),
          role: membership?.role ?? "owner",
        };
      } catch (e) {
        if (replyIfLimitError(reply, e)) return;
        throw e;
      }
    },
  );

  app.get(
    "/v1/workspaces",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["workspaces"], security: [{ bearerAuth: [] }] },
    },
    async (req) => {
      const rows = await deps.workspaces.listForUser(req.user.sub);
      return rows.map(
        (r: { workspace: Workspace; role: WorkspaceMemberRole }) => ({
          ...deps.workspaces.toPublic(r.workspace),
          role: r.role,
        }),
      );
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["workspaces"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["workspaceId"],
          properties: { workspaceId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (req, reply) => {
      const { workspaceId } = req.params as { workspaceId: string };
      await deps.workspaceService.assertMember(workspaceId, req.user.sub);
      const ws = await deps.workspaces.findById(workspaceId);
      if (!ws) return reply.notFound("Workspace not found");
      return deps.workspaces.toPublic(ws);
    },
  );

  app.get(
    "/v1/plans",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["billing"], security: [{ bearerAuth: [] }] },
    },
    async () => deps.usage.listPlans(),
  );

  app.get(
    "/v1/workspaces/:workspaceId/usage",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["billing"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["workspaceId"],
          properties: { workspaceId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      await deps.workspaceService.assertMember(workspaceId, req.user.sub);
      const snapshot = await deps.usage.getWorkspaceUsage(workspaceId, req.user.sub);
      const { plan, ...usage } = snapshot;
      return {
        plan: plan.id,
        planLabel: plan.label,
        limits: plan,
        usage,
      };
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/settings",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["workspaces"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["workspaceId"],
          properties: { workspaceId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (req, reply) => {
      const { workspaceId } = req.params as { workspaceId: string };
      await deps.workspaceService.assertRole(workspaceId, req.user.sub, [
        "owner",
        "admin",
      ]);
      const body = settingsSchema.parse(req.body);
      const ws = await deps.workspaces.updateSettings(workspaceId, {
        allowedDomains: body.allowedDomains,
        widgetSettings: body.widgetSettings,
      });
      if (!ws) return reply.notFound("Workspace not found");
      return deps.workspaces.toPublic(ws);
    },
  );
}
