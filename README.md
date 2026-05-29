# RAG Agent Platform (MVP)

Production-oriented monorepo: **Fastify API** + **BullMQ ingestion worker** + **Next.js dashboard**, backed by **PostgreSQL + pgvector** and **Redis**.

## Prerequisites

- Node.js 20+
- Docker (for Postgres + Redis, optional for full stack)

## Quick start (local)

1. Copy environment template and fill secrets (especially `OPENAI_API_KEY`, `JWT_*`):

   `cp .env.example .env`

2. Start databases:

   `docker compose up -d postgres redis`

3. Apply migrations:

   `npm run db:migrate`

4. Run **API**, **worker**, and **web** in separate terminals:

   - `npm run dev -w @rag/api`
   - `npm run worker`
   - `npm run dev -w @rag/web`

   API: `http://localhost:4000` · OpenAPI UI: `http://localhost:4000/docs` · Web: `http://localhost:3000`

5. Optional — test embed on a sample page (HTTP, not `file://`):

   `npx --yes serve demo-site -p 8080` → http://localhost:8080

## Docker (all services)

Ensure `.env` exists with production-like values (JWT secrets, `DATABASE_URL` pointing to the `postgres` service: `postgresql://rag:rag@postgres:5432/rag`, `REDIS_URL=redis://redis:6379`, `CORS_ORIGIN` including your web origin).

```bash
docker compose build
docker compose up -d postgres redis
npm run db:migrate
docker compose up -d api worker web
```

The `api` and `worker` images run migrations separately in your release pipeline; the repo ships SQL under `apps/api/drizzle/`.

## API surface (v1)

- `POST /v1/auth/signup` · `POST /v1/auth/login` · `POST /v1/auth/refresh`
- `POST /v1/workspaces` · `GET /v1/workspaces` · `GET /v1/workspaces/:id`
- `POST /v1/workspaces/:id/documents/upload` (multipart field `file`)
- `GET /v1/workspaces/:id/documents`
- `POST /v1/workspaces/:id/retrieve` (semantic search JSON body)
- `POST /v1/workspaces/:id/chat/stream` (SSE; JSON body `{ message, conversationId? }`)
- `GET /v1/workspaces/:id/conversations` · `GET /v1/workspaces/:id/conversations/:cid/messages`

## Testing

```bash
npm run test -w @rag/api
```

## Documentation

| Doc | Audience |
|-----|----------|
| **[docs/USER.md](./docs/USER.md)** | Sign up, workspaces, uploads, plans, embed widget, troubleshooting |
| **[docs/ADMIN.md](./docs/ADMIN.md)** | Super admin, change plans, database browser, `admin:promote`, SQL |
| **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** | Product flow, ingestion, RAG chat, embed widget, data model |
| **[AGENTS.md](./AGENTS.md)** | Module layout and conventions for contributors |

**Super admin (quick):** after signup → `npm run admin:promote -- your@email.com` → log in → http://localhost:3000/admin

## Local dev checklist

Run from the repo root (`.env` should use `localhost` for Postgres and Redis):

| Step | Command |
|------|---------|
| 1 | `docker compose up -d postgres redis` |
| 2 | `npm install` (once) |
| 3 | `npm run db:migrate` |
| 4 | Terminal 1: `npm run dev -w @rag/api` |
| 5 | Terminal 2: `npm run worker` |
| 6 | Terminal 3: `npm run dev -w @rag/web` |
