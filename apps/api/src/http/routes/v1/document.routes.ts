import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DocumentRepository } from "../../../modules/documents/document.repository.js";
import type { DocumentService } from "../../../modules/documents/document.service.js";
import type { WorkspaceService } from "../../../modules/workspaces/workspace.service.js";

import type { RetrievalService } from "../../../modules/retrieval/retrieval.service.js";

const retrieveSchema = z.object({
  query: z.string().min(1).max(4000),
  topK: z.number().int().min(1).max(50).optional(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
});

export async function registerDocumentRoutes(
  app: FastifyInstance,
  deps: {
    workspaceService: WorkspaceService;
    documents: DocumentRepository;
    documentService: DocumentService;
    retrieval: RetrievalService;
  },
) {
  app.post(
    "/v1/workspaces/:workspaceId/documents/upload",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
        consumes: ["multipart/form-data"],
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
        "member",
      ]);
      const mp = await req.file();
      if (!mp) return reply.badRequest("file field is required");
      const buf = await mp.toBuffer();
      const documentId = await deps.documentService.saveUpload({
        workspaceId,
        filename: mp.filename,
        buffer: buf,
        declaredMime: mp.mimetype,
      });
      return { documentId, status: "pending" };
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/documents",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["documents"],
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
      return deps.documents.listByWorkspace(workspaceId);
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/documents/:documentId",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["documents"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["workspaceId", "documentId"],
          properties: {
            workspaceId: { type: "string", format: "uuid" },
            documentId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (req, reply) => {
      const { workspaceId, documentId } = req.params as {
        workspaceId: string;
        documentId: string;
      };
      await deps.workspaceService.assertRole(workspaceId, req.user.sub, [
        "owner",
        "admin",
        "member",
      ]);
      const removed = await deps.documentService.deleteWorkspaceDocument({
        workspaceId,
        documentId,
      });
      if (!removed) return reply.notFound("Document not found");
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/retrieve",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["retrieval"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["workspaceId"],
          properties: { workspaceId: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            topK: { type: "integer", minimum: 1, maximum: 50 },
            documentIds: { type: "array", items: { type: "string", format: "uuid" } },
          },
        },
      },
    },
    async (req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      await deps.workspaceService.assertMember(workspaceId, req.user.sub);
      const body = retrieveSchema.parse(req.body);
      return deps.retrieval.retrieve({
        workspaceId,
        query: body.query,
        topK: body.topK,
        documentIds: body.documentIds,
      });
    },
  );
}
