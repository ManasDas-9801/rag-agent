import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PlanId } from "../../../modules/billing/plans.js";
import type { AdminDbService } from "../../../modules/admin/admin-db.service.js";
import type { AdminService } from "../../../modules/admin/admin.service.js";
import type { UserRepository } from "../../../modules/users/user.repository.js";

const updateUserSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  plan: z.enum(["free", "pro", "business"]).optional(),
});

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: {
    admin: AdminService;
    adminDb: AdminDbService;
    users: UserRepository;
  },
) {
  app.get(
    "/v1/admin/stats",
    { onRequest: [app.requireAdmin], schema: { tags: ["admin"], security: [{ bearerAuth: [] }] } },
    async () => deps.admin.platformStats(),
  );

  app.get(
    "/v1/admin/users",
    { onRequest: [app.requireAdmin], schema: { tags: ["admin"], security: [{ bearerAuth: [] }] } },
    async () => deps.admin.listUsersWithUsage(),
  );

  app.patch(
    "/v1/admin/users/:userId",
    {
      onRequest: [app.requireAdmin],
      schema: {
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const body = updateUserSchema.parse(req.body);
      const user = await deps.admin.updateUser(userId, {
        role: body.role,
        plan: body.plan as PlanId | undefined,
      });
      if (!user) return reply.notFound("User not found");
      return deps.users.toPublic(user);
    },
  );

  app.get(
    "/v1/admin/db/tables",
    { onRequest: [app.requireAdmin], schema: { tags: ["admin"], security: [{ bearerAuth: [] }] } },
    async () => ({ tables: await deps.adminDb.listTables() }),
  );

  app.get(
    "/v1/admin/db/tables/:table",
    {
      onRequest: [app.requireAdmin],
      schema: {
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["table"],
          properties: { table: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { table } = req.params as { table: string };
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).optional(),
          offset: z.coerce.number().int().min(0).optional(),
        })
        .parse(req.query);
      try {
        return await deps.adminDb.browseTable(table, query.limit, query.offset);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "INVALID_TABLE") {
          return reply.badRequest("Table not available");
        }
        throw e;
      }
    },
  );
}
