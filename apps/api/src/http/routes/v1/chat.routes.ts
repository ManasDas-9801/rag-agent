import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../../../config/env.js";
import type { ChatService } from "../../../modules/chat/chat.service.js";
import type { ConversationRepository } from "../../../modules/documents/document.repository.js";
import type { WorkspaceService } from "../../../modules/workspaces/workspace.service.js";

const streamSchema = z.object({
  message: z.string().min(1).max(8000),
  conversationId: z.string().uuid().optional(),
});

/** Hijacked SSE replies skip @fastify/cors; mirror its allowlist + credentials. */
function corsHeadersForSse(req: FastifyRequest, cfg: AppConfig): Record<string, string> {
  const allowed = cfg.CORS_ORIGIN.split(",").map((s) => s.trim());
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!origin) {
    if (allowed.length === 1) {
      return {
        "Access-Control-Allow-Origin": allowed[0]!,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
      };
    }
    return { Vary: "Origin" };
  }
  if (!allowed.includes(origin)) {
    return { Vary: "Origin" };
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export async function registerChatRoutes(
  app: FastifyInstance,
  deps: {
    config: AppConfig;
    workspaceService: WorkspaceService;
    chat: ChatService;
    conversations: ConversationRepository;
  },
) {
  app.post(
    "/v1/workspaces/:workspaceId/chat/stream",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["chat"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["workspaceId"],
          properties: { workspaceId: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
            conversationId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (req, reply) => {
      const { workspaceId } = req.params as { workspaceId: string };
      await deps.workspaceService.assertMember(workspaceId, req.user.sub);
      const body = streamSchema.parse(req.body);
      const reqId = (req.id as string) || "req";
      reply.hijack();
      reply.raw.writeHead(200, {
        ...corsHeadersForSse(req, deps.config),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": reqId,
        "X-Accel-Buffering": "no",
      });
      await deps.chat.streamChat({
        workspaceId,
        actor: { mode: "user", userId: req.user.sub },
        conversationId: body.conversationId,
        message: body.message,
        reply,
        reqId,
      });
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/conversations",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["chat"],
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
      return deps.conversations.list(workspaceId, req.user.sub);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/conversations/:conversationId/messages",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["chat"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["workspaceId", "conversationId"],
          properties: {
            workspaceId: { type: "string", format: "uuid" },
            conversationId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (req, reply) => {
      const { workspaceId, conversationId } = req.params as {
        workspaceId: string;
        conversationId: string;
      };
      await deps.workspaceService.assertMember(workspaceId, req.user.sub);
      const conv = await deps.conversations.findById(conversationId);
      if (!conv || conv.workspaceId !== workspaceId || conv.userId !== req.user.sub) {
        return reply.notFound();
      }
      return deps.conversations.recentMessages(conversationId, 200);
    },
  );
}
