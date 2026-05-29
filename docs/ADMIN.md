# Admin guide

How to run the platform as a **super admin**: promote your account, manage users and plans, browse the database, and use external PostgreSQL tools.

Related docs: [USER.md](./USER.md) · [README](../README.md) · [HOW_IT_WORKS.md](../HOW_IT_WORKS.md)

---

## Overview

| Feature | URL / command |
|---------|----------------|
| Admin dashboard | http://localhost:3000/admin |
| Users & plans | http://localhost:3000/admin/users |
| Database browser (read-only) | http://localhost:3000/admin/database |
| Promote CLI | `npm run admin:promote -- email@example.com` |

**Database:** This project uses **PostgreSQL** (with pgvector), **not MySQL**. There is no phpMyAdmin built in, but the admin **Database** page is a similar table browser. For full SQL, use pgAdmin, DBeaver, or `psql`.

---

## Become super admin

### Step 1 — Create your account

Sign up at http://localhost:3000/signup (or log in if you already exist).

### Step 2 — Promote to admin

From the **repo root**, with Postgres running and migrations applied:

```bash
npm run admin:promote -- your@email.com
```

Optional — set plan at the same time:

```bash
npm run admin:promote -- your@email.com --plan=business
```

Valid plans: `free`, `pro`, `business`.

### Step 3 — Log in again

Log out and log in. Admins are redirected to `/admin`. The header shows an **Admin** link on workspace pages.

---

## Alternative: SQL

Connect to Postgres (see [External database access](#external-database-access)):

```sql
-- Super admin + Pro plan
UPDATE users
SET role = 'admin', plan = 'pro'
WHERE email = 'your@email.com';

-- Verify
SELECT id, email, role, plan, created_at FROM users;
```

**Roles:**

| `users.role` | Access |
|--------------|--------|
| `user` | Own workspaces only |
| `admin` | `/admin` UI + all admin APIs |

---

## Admin UI

### Overview (`/admin`)

- Total users, workspaces, documents
- Quick reference for `admin:promote`

### Users & plans (`/admin/users`)

For every registered user you can see:

- Email, user id, join date
- **Plan** dropdown (Free / Pro / Business) — saves immediately
- **Role** dropdown (User / Admin)
- Usage vs limits:
  - Owned workspaces
  - Documents (across owned workspaces)
  - Storage (MB)
  - Embed messages this month

Changes call `PATCH /v1/admin/users/:userId`.

### Database browser (`/admin/database`)

- Lists allowed application tables
- Paginated rows (50 per page)
- **Read-only** — no INSERT/UPDATE/DELETE from UI
- Sensitive fields redacted: `password_hash`, `token_hash`, `embedding`, masked `embed_public_key`

**Allowed tables:**

`users`, `workspaces`, `workspace_members`, `documents`, `document_chunks`, `conversations`, `messages`, `usage_events`, `refresh_tokens`

---

## Change a user’s plan

### Via admin UI (recommended)

1. Go to http://localhost:3000/admin/users
2. Find the user
3. Change **Plan** dropdown

Plan limits are defined in `apps/api/src/modules/billing/plans.ts`:

| Plan | Owned workspaces | Docs / workspace | Storage / workspace | Max upload | Embed msgs / month |
|------|------------------|------------------|---------------------|------------|---------------------|
| free | 2 | 5 | 50 MB | 10 MB | 200 |
| pro | 10 | 50 | 500 MB | 50 MB | 5,000 |
| business | 100 | 500 | 10 GB | 100 MB | 100,000 |

### Via SQL

```sql
UPDATE users SET plan = 'pro' WHERE email = 'customer@example.com';
```

### Via API

```http
PATCH /v1/admin/users/:userId
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{ "plan": "pro", "role": "user" }
```

---

## Admin API reference

All routes require `Authorization: Bearer <token>` and `users.role = 'admin'`. Otherwise **403 Forbidden**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/admin/stats` | `{ users, workspaces, documents }` counts |
| GET | `/v1/admin/users` | All users with usage aggregates |
| PATCH | `/v1/admin/users/:userId` | Body: `{ "role"?: "user"\|"admin", "plan"?: "free"\|"pro"\|"business" }` |
| GET | `/v1/admin/db/tables` | `{ tables: string[] }` |
| GET | `/v1/admin/db/tables/:table?limit=50&offset=0` | Paginated rows (masked) |

**Example — list users:**

```bash
curl -s http://localhost:4000/v1/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" | jq
```

**Example — upgrade plan:**

```bash
curl -s -X PATCH http://localhost:4000/v1/admin/users/USER_UUID \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"plan":"business"}' | jq
```

---

## External database access

Use these when you need arbitrary SQL (migrations debugging, bulk fixes, backups).

### Connection string

From `.env`:

```env
DATABASE_URL=postgresql://rag:rag@localhost:5432/rag
```

### psql (Docker)

```bash
docker compose exec postgres psql -U rag -d rag
```

### Useful SQL

```sql
-- All users
SELECT id, email, role, plan, created_at FROM users ORDER BY created_at DESC;

-- Workspaces per owner
SELECT u.email, w.name, w.id
FROM workspaces w
JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.role = 'owner'
JOIN users u ON u.id = wm.user_id;

-- Document ingestion status
SELECT workspace_id, filename, status, ingestion FROM documents ORDER BY created_at DESC LIMIT 20;

-- Embed usage this month
SELECT workspace_id, count(*) FROM usage_events
WHERE kind = 'embed_chat_completion'
  AND created_at >= date_trunc('month', now())
GROUP BY workspace_id;
```

### GUI tools

| Tool | Notes |
|------|--------|
| [pgAdmin](https://www.pgadmin.org/) | Closest to phpMyAdmin for PostgreSQL |
| [DBeaver](https://dbeaver.io/) | Free, multi-DB |
| TablePlus / DataGrip | Commercial options |

---

## Security (production)

1. **Do not expose `/admin` publicly** without extra controls (VPN, IP allowlist, SSO).
2. **Rotate JWT secrets** (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) for production.
3. **Limit who has `role = 'admin'`** — full user and DB visibility.
4. The built-in DB browser is read-only but still shows PII (emails, conversation text). Treat admin accounts as highly privileged.
5. **Never commit** `.env`, embed keys, or `demo-site/index.html` with real keys to a public repo.

---

## CLI reference

| Command | Description |
|---------|-------------|
| `npm run admin:promote -- <email>` | Set `role = admin` |
| `npm run admin:promote -- <email> --plan=pro` | Admin + plan |
| `npm run db:migrate` | Apply SQL migrations |

Script location: `apps/api/src/scripts/promote-admin.ts`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `/admin` redirects to dashboard | User is not admin; run `admin:promote` and log in again |
| Admin API returns 403 | JWT issued before promotion — log out/in |
| Database page empty | Run `npm run db:migrate`; check `DATABASE_URL` |
| Cannot connect with pgAdmin | Ensure `docker compose up -d postgres`; port 5432 exposed |

---

## File map (admin code)

| Path | Purpose |
|------|---------|
| `apps/api/src/http/routes/v1/admin.routes.ts` | Admin HTTP routes |
| `apps/api/src/modules/admin/admin.service.ts` | User list + usage |
| `apps/api/src/modules/admin/admin-db.service.ts` | Table browser |
| `apps/api/src/scripts/promote-admin.ts` | CLI promote |
| `apps/api/src/http/plugins/jwt.ts` | `requireAdmin` guard |
| `apps/web/src/app/admin/**` | Admin UI pages |
| `apps/web/src/components/app/admin-shell.tsx` | Admin layout + guard |

---

## See also

- End-user features: [USER.md](./USER.md)
- Product architecture: [HOW_IT_WORKS.md](../HOW_IT_WORKS.md)
