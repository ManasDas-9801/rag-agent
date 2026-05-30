# RAG Agent Platform (MVP)

Production-oriented monorepo: **Fastify API** + **BullMQ ingestion worker** + **Next.js dashboard**, backed by **PostgreSQL + pgvector** and **Redis**.

## Prerequisites

- Node.js 20+
- Docker (Postgres + Redis for local dev)

## Quick start (recommended — RAG CLI)

From the **repo root**:

```bash
cp .env.example .env          # fill OPENAI/GEMINI keys, JWT_* , etc.
```

**Windows (PowerShell / CMD):**

```powershell
rag.cmd install
rag.cmd start
```

**macOS / Linux / Git Bash:**

```bash
chmod +x rag
./rag install
./rag start
```

**npm (any OS):**

```bash
npm run rag -- install
npm run rag -- start
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Dashboard (signup, workspaces, embed snippet) |
| http://localhost:4000 | API · OpenAPI: http://localhost:4000/docs |
| http://localhost:8080 | Demo embed site (HTTP — do not use `file://`) |

Stop dev processes: `./rag stop` or `rag.cmd stop`  
Also stop Postgres/Redis: `./rag stop --docker`

## RAG CLI reference

| Command | Action |
|---------|--------|
| `install` | `npm install` |
| `migrate` | `npm run db:migrate` (alias: `migarte`) |
| `start` | Docker (postgres, redis) → migrate → API + worker + web + demo |
| `stop` | Stop API, worker, web, demo |
| `stop --docker` | Above + stop postgres/redis containers |
| `status` | Docker + tracked Node processes |
| `promote <email>` | Super admin (`--plan=free\|pro\|business` optional) |
| `help` | Show all commands |

Implementation: [`rag.mjs`](./rag.mjs) · Windows wrapper: [`rag.cmd`](./rag.cmd)

**Super admin:** `./rag promote your@email.com` → log out/in → http://localhost:3000/admin

## Quick start (manual)

If you prefer separate terminals instead of `./rag start`:

1. `docker compose up -d postgres redis`
2. `npm install`
3. `npm run db:migrate`
4. `npm run dev -w @rag/api` — http://localhost:4000
5. `npm run worker` — **required** for document ingestion
6. `npm run dev -w @rag/web` — http://localhost:3000
7. `npx --yes serve demo-site -p 8080` — http://localhost:8080

## Docker (all services in containers)

Ensure `.env` uses service hostnames (`DATABASE_URL=postgresql://rag:rag@postgres:5432/rag`, `REDIS_URL=redis://redis:6379`).

```bash
docker compose build
docker compose up -d postgres redis
npm run db:migrate
docker compose up -d api worker web
```

SQL migrations live under `apps/api/drizzle/`.

## API surface (v1)

- `POST /v1/auth/signup` · `POST /v1/auth/login` · `POST /v1/auth/refresh` · `GET /v1/auth/me`
- `POST /v1/workspaces` · `GET /v1/workspaces` · `GET /v1/workspaces/:id`
- `POST /v1/workspaces/:id/documents/upload` (multipart field `file`)
- `GET /v1/workspaces/:id/documents` · `POST .../documents/:id/reingest`
- `POST /v1/workspaces/:id/retrieve` · `GET /v1/workspaces/:id/embed`
- `GET /v1/embed/widget.js` · `POST /v1/embed/chat/stream` (public SSE)
- Admin: `GET /v1/admin/users` · `PATCH /v1/admin/users/:id` (role `admin` only)

## Testing

```bash
npm run test -w @rag/api
```

## Documentation

| Doc | Audience |
|-----|----------|
| **[CURSOR.md](./CURSOR.md)** | Cursor / AI project memory |
| **[docs/USER.md](./docs/USER.md)** | Workspaces, uploads, plans, embed widget |
| **[docs/ADMIN.md](./docs/ADMIN.md)** | Super admin, plans, database browser |
| **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** | Architecture and data flow |
| **[AGENTS.md](./AGENTS.md)** | Module layout for contributors |
