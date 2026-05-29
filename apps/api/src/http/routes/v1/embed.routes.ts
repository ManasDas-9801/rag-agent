import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../../../config/env.js";
import type { ConversationRepository } from "../../../modules/documents/document.repository.js";
import type { ChatService } from "../../../modules/chat/chat.service.js";
import type { WorkspaceRepository } from "../../../modules/workspaces/workspace.repository.js";
import type { WorkspaceService } from "../../../modules/workspaces/workspace.service.js";

const embedAuthQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  embedKey: z.string().min(16).max(64),
  visitorId: z.string().min(8).max(128),
});

const embedStreamSchema = z.object({
  workspaceId: z.string().uuid(),
  embedKey: z.string().min(16).max(64),
  visitorId: z.string().min(8).max(128),
  message: z.string().min(1).max(8000),
  conversationId: z.string().uuid().optional(),
});

function setPublicEmbedCors(req: FastifyRequest, reply: FastifyReply) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "*";
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");
  reply.header("Access-Control-Max-Age", "86400");
}

function corsHeadersForEmbedSse(req: FastifyRequest): Record<string, string> {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "false",
  };
}

function buildWidgetScript(cfg: AppConfig, apiBase: string, widgetOrigin: string) {
  const api = apiBase.replace(/\/$/, "");
  const web = widgetOrigin.replace(/\/$/, "");
  return `(function(){
  var s=document.currentScript;
  if(!s)return;
  var ws=s.getAttribute("data-workspace-id");
  var key=s.getAttribute("data-embed-key");
  if(!ws||!key){console.error("[RAG] data-workspace-id and data-embed-key are required");return;}
  var apiBase=s.getAttribute("data-api-url")||${JSON.stringify(api)};
  var webOrigin=s.getAttribute("data-widget-origin")||${JSON.stringify(web)};
  var z=s.getAttribute("data-z-index")||"99999";
  var btn=document.createElement("button");
  btn.type="button";
  btn.setAttribute("aria-label","Open chat");
  btn.style.cssText="position:fixed;bottom:20px;right:20px;z-index:"+z+";width:56px;height:56px;border-radius:50%;border:none;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(79,70,229,.4)";
  btn.textContent="Chat";
  var panel=document.createElement("div");
  panel.style.cssText="display:none;position:fixed;bottom:88px;right:20px;z-index:"+z+";width:380px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.18);background:#fff";
  var iframe=document.createElement("iframe");
  iframe.title="Chat";
  iframe.style.cssText="width:100%;height:100%;border:0";
  iframe.src=webOrigin+"/embed/"+encodeURIComponent(ws)+"?key="+encodeURIComponent(key);
  panel.appendChild(iframe);
  var open=false;
  btn.addEventListener("click",function(){open=!open;panel.style.display=open?"block":"none";});
  document.body.appendChild(btn);
  document.body.appendChild(panel);
})();`;
}

export async function registerEmbedRoutes(
  app: FastifyInstance,
  deps: {
    config: AppConfig;
    workspaceService: WorkspaceService;
    workspaces: WorkspaceRepository;
    conversations: ConversationRepository;
    chat: ChatService;
  },
) {
  const apiPublic = deps.config.PUBLIC_API_URL.replace(/\/$/, "");
  const widgetOrigin = deps.config.EMBED_WIDGET_ORIGIN.replace(/\/$/, "");

  app.options("/v1/embed/chat/stream", async (req, reply) => {
    setPublicEmbedCors(req, reply);
    return reply.code(204).send();
  });

  app.options("/v1/embed/conversations/:conversationId/messages", async (req, reply) => {
    setPublicEmbedCors(req, reply);
    return reply.code(204).send();
  });

  app.get(
    "/v1/embed/widget.js",
    {
      config: { rateLimit: { max: 300, timeWindow: 60_000 } },
    },
    async (req, reply) => {
      setPublicEmbedCors(req, reply);
      const script = buildWidgetScript(deps.config, apiPublic, widgetOrigin);
      return reply.type("application/javascript; charset=utf-8").send(script);
    },
  );

  app.post(
    "/v1/embed/chat/stream",
    {
      config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    },
    async (req, reply) => {
      setPublicEmbedCors(req, reply);
      const body = embedStreamSchema.parse(req.body);
      const ws = await deps.workspaces.findByEmbedAuth(body.workspaceId, body.embedKey);
      if (!ws) {
        return reply.code(401).send({ error: "Invalid workspace or embed key" });
      }

      const reqId = (req.id as string) || "req";
      reply.hijack();
      reply.raw.writeHead(200, {
        ...corsHeadersForEmbedSse(req),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": reqId,
        "X-Accel-Buffering": "no",
      });

      await deps.chat.streamChat({
        workspaceId: body.workspaceId,
        actor: { mode: "embed", visitorId: body.visitorId },
        conversationId: body.conversationId,
        message: body.message,
        reply,
        reqId,
      });
    },
  );

  app.get(
    "/v1/embed/conversations/:conversationId/messages",
    {
      config: { rateLimit: { max: 120, timeWindow: 60_000 } },
    },
    async (req, reply) => {
      setPublicEmbedCors(req, reply);
      const { conversationId } = req.params as { conversationId: string };
      const query = embedAuthQuerySchema.parse(req.query);
      const ws = await deps.workspaces.findByEmbedAuth(query.workspaceId, query.embedKey);
      if (!ws) {
        return reply.code(401).send({ error: "Invalid workspace or embed key" });
      }
      const conv = await deps.conversations.findByIdForEmbed(
        conversationId,
        query.workspaceId,
        query.visitorId,
      );
      if (!conv) {
        return reply.notFound("Conversation not found");
      }
      const rows = await deps.conversations.recentMessages(conversationId, 200);
      return rows
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }));
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/embed",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["embed"],
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
      const ws = await deps.workspaces.ensureEmbedKey(workspaceId);
      if (!ws?.embedPublicKey) {
        throw new Error("Could not provision embed key");
      }
      const snippet = `<script
  src="${apiPublic}/v1/embed/widget.js"
  data-workspace-id="${ws.id}"
  data-embed-key="${ws.embedPublicKey}"
  async
></script>`;
      return {
        workspaceId: ws.id,
        embedKey: ws.embedPublicKey,
        apiUrl: apiPublic,
        widgetOrigin,
        snippet,
      };
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/embed/rotate-key",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["embed"],
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
      await deps.workspaceService.assertRole(workspaceId, req.user.sub, [
        "owner",
        "admin",
      ]);
      const ws = await deps.workspaces.rotateEmbedKey(workspaceId);
      if (!ws?.embedPublicKey) {
        throw new Error("Could not rotate embed key");
      }
      const snippet = `<script
  src="${apiPublic}/v1/embed/widget.js"
  data-workspace-id="${ws.id}"
  data-embed-key="${ws.embedPublicKey}"
  async
></script>`;
      return {
        workspaceId: ws.id,
        embedKey: ws.embedPublicKey,
        snippet,
      };
    },
  );
}
