import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { AppConfig } from "../config/env.js";
import { createDb, type Db } from "../infra/db/client.js";
import { createIngestionQueue } from "../infra/queues/ingestion.queue.js";
import { UserRepository } from "../modules/users/user.repository.js";
import { RefreshTokenRepository } from "../modules/auth/refresh-token.repository.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { WorkspaceRepository } from "../modules/workspaces/workspace.repository.js";
import { WorkspaceService } from "../modules/workspaces/workspace.service.js";
import { DocumentRepository, ConversationRepository } from "../modules/documents/document.repository.js";
import { DocumentService } from "../modules/documents/document.service.js";
import { Embedder } from "../modules/ingestion/embedder.js";
import { RetrievalService } from "../modules/retrieval/retrieval.service.js";
import { ChatService } from "../modules/chat/chat.service.js";
import { UsageService } from "../modules/billing/usage.service.js";
import { UsageRepository } from "../modules/usage/usage.repository.js";
import { authJwtPlugin } from "./plugins/jwt.js";
import { registerAuthRoutes } from "./routes/v1/auth.routes.js";
import { registerWorkspaceRoutes } from "./routes/v1/workspace.routes.js";
import { registerDocumentRoutes } from "./routes/v1/document.routes.js";
import { registerChatRoutes } from "./routes/v1/chat.routes.js";
import { registerEmbedRoutes } from "./routes/v1/embed.routes.js";
import { AdminService } from "../modules/admin/admin.service.js";
import { AdminDbService } from "../modules/admin/admin-db.service.js";
import { registerAdminRoutes } from "./routes/v1/admin.routes.js";

export type AppContext = {
  config: AppConfig;
  db: Db;
  close: () => Promise<void>;
};

export type BuiltApp = {
  app: FastifyInstance;
  ctx: AppContext;
};

export async function buildApp(cfg: AppConfig): Promise<BuiltApp> {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      ...(cfg.NODE_ENV !== "production"
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "SYS:standard" },
            },
          }
        : {}),
    },
    genReqId: () => randomUUID(),
    requestIdHeader: "x-request-id",
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: cfg.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: cfg.RATE_LIMIT_MAX,
    timeWindow: cfg.RATE_LIMIT_WINDOW_MS,
  });
  await app.register(multipart, {
    limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "RAG Agent Platform API",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });
  if (cfg.NODE_ENV !== "production") {
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  await app.register(authJwtPlugin, {
    secret: cfg.JWT_ACCESS_SECRET,
    expiresIn: `${cfg.JWT_ACCESS_TTL_MINUTES}m`,
  });

  const db = createDb(cfg.DATABASE_URL);
  const { queue: ingestionQueue, connection: ingestionRedis } = createIngestionQueue(
    cfg.REDIS_URL,
  );

  const users = new UserRepository(db);
  const refreshTokens = new RefreshTokenRepository(db);
  const authService = new AuthService(cfg, users, refreshTokens);
  const workspaces = new WorkspaceRepository(db);
  const usageBilling = new UsageService(db);
  const workspaceService = new WorkspaceService(workspaces, usageBilling);
  const documents = new DocumentRepository(db);
  const conversations = new ConversationRepository(db);
  const documentService = new DocumentService(cfg, documents, ingestionQueue, usageBilling);
  const embedder = new Embedder(cfg);
  const retrieval = new RetrievalService(documents, embedder);
  const usage = new UsageRepository(db);
  const chat = new ChatService(cfg, conversations, retrieval, usage);

  await registerAuthRoutes(app, { authService, users });
  await registerWorkspaceRoutes(app, { workspaces, workspaceService, usage: usageBilling });
  await registerDocumentRoutes(app, {
    workspaceService,
    documents,
    documentService,
    retrieval,
  });
  await registerChatRoutes(app, { config: cfg, workspaceService, chat, conversations });
  await registerEmbedRoutes(app, {
    config: cfg,
    workspaceService,
    workspaces,
    conversations,
    chat,
    usage: usageBilling,
  });

  const adminService = new AdminService(db, users);
  const adminDb = new AdminDbService(db);
  await registerAdminRoutes(app, { admin: adminService, adminDb, users });

  app.get(
    "/health",
    { config: { rateLimit: false } },
    async () => ({ status: "ok", service: "api" }),
  );

  const ctx: AppContext = {
    config: cfg,
    db,
    close: async () => {
      await app.close();
      await ingestionQueue.close();
      ingestionRedis.disconnect();
      await db.pool.end();
    },
  };

  return { app, ctx };
}
