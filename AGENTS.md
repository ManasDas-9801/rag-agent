# RAG Agent Platform — Agent Guide

This repository is an **npm workspaces** monorepo for a production-oriented RAG SaaS MVP.

## Layout

| Path | Purpose |
|------|---------|
| `apps/api` | Fastify REST API, SSE chat streaming, BullMQ ingestion worker, Drizzle ORM |
| `apps/web` | Next.js (App Router) dashboard, auth, uploads, chat UI |

## Runtime dependencies (local / Docker)

- **PostgreSQL 16 + pgvector** — relational data + embeddings
- **Redis** — BullMQ queues for async ingestion with retries
- **OpenAI or Google Gemini** — embeddings + chat (`AI_PROVIDER=openai|gemini` in env)

## Architecture (clean-ish modules)

Inside `apps/api/src`:

- **`config/`** — env parsing (Zod), typed `AppConfig` (includes `AI_PROVIDER`)
- **`infra/`** — DB pool, logger (Pino), Redis/BullMQ factories, OpenAI client
- **`modules/*`** — vertical slices: `auth`, `users`, `workspaces`, `documents`, `ingestion`, `chat`, `retrieval`, `usage`
- **`http/`** — Fastify plugins (CORS, JWT, rate limit, multipart), route registration, error mapping
- **`workers/`** — ingestion worker entry (`worker.ts`)

Flow: **HTTP controller → service → repository**. DTOs live next to controllers as Zod schemas.

## Auth model

- **Access JWT** (short) + **refresh token** (opaque, stored hashed in `refresh_tokens`)
- **Global roles** on `users.role`: `user` | `admin`
- **Workspace RBAC** on `workspace_members.role`: `owner` | `admin` | `member`
- Workspace-scoped routes resolve `workspaceId` from params and verify membership

## Ingestion pipeline

1. Multipart upload → file saved under `UPLOAD_DIR` / `{workspaceId}/{documentId}`
2. `documents.status` = `pending` → BullMQ job
3. Worker: parse (PDF/DOCX/TXT/MD) → clean → chunk (size/overlap from env) → OpenAI embeddings (batched, retries) → insert `document_chunks` with pgvector
4. Progress stored in `documents.ingestion` JSON + `status` transitions

## RAG & chat

- **Retrieval**: pgvector cosine distance (`<=>`), top-k, optional metadata filters (JSONB on chunks)
- **Rerank**: in-process cosine re-score (abstraction in `modules/retrieval/reranker.ts` for future cross-encoder)
- **Chat**: loads recent messages from DB, retrieves context, streams OpenAI completion via **SSE** (`POST /v1/workspaces/:id/chat/stream`)
- **Citations**: assistant message `metadata.citations` array with chunk id, filename, page, snippet
- **Grounding**: system prompt instructs to answer only from context; if empty, refuse

## Hybrid-ready retrieval

Vector search is isolated in `VectorSearchRepository`. Keyword/BM25 can be added as a second retriever and fused in `RetrievalService` without changing HTTP contracts.

## Commands

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
npm run dev:api
npm run dev:web
```

API OpenAPI: `http://localhost:4000/docs` (non-production) or `/documentation` depending on Fastify swagger-ui path.

## Conventions

- TypeScript strict mode
- Validate inputs with **Zod** at HTTP boundary
- No secrets in code; use `config` from env
- Prefer **idempotency** on ingestion jobs (re-run safe for same document version when extended)

## CI

Root `npm test` runs Vitest in packages that define `test`. Keep tests fast: unit for pure logic, integration gated behind `TEST_DATABASE_URL` if added later.
