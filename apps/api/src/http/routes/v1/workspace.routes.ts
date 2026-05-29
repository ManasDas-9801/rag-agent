import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WorkspaceRepository } from "../../../modules/workspaces/workspace.repository.js";
import type { WorkspaceService } from "../../../modules/workspaces/workspace.service.js";
import type { Workspace } from "../../../infra/db/schema.js";
import { workspaceMembers } from "../../../infra/db/schema.js";

const createSchema = z.object({
  name: z.string().min(2).max(200),
});

type WorkspaceMemberRole = (typeof workspaceMembers.$inferSelect)["role"];

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: { workspaces: WorkspaceRepository; workspaceService: WorkspaceService },
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
    async (req) => {
      const body = createSchema.parse(req.body);
      const userId = req.user.sub;
      const ws = await deps.workspaceService.create(userId, body.name);
      const membership = await deps.workspaces.findMembership(ws.id, userId);
      return {
        ...deps.workspaces.toPublic(ws),
        role: membership?.role ?? "owner",
      };
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
}
