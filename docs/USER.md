# User guide

How to use the RAG Agent Platform as a **workspace owner**: sign up, upload knowledge, deploy the embed chat, and stay within your plan limits.

Related docs: [README](../README.md) · [How it works](../HOW_IT_WORKS.md) · [Admin guide](./ADMIN.md)

---

## Quick start

1. Copy env and start infrastructure (from repo root):

   ```bash
   cp .env.example .env
   docker compose up -d postgres redis
   npm install
   npm run db:migrate
   ```

2. Run three processes (separate terminals):

   ```bash
   npm run dev -w @rag/api    # http://localhost:4000
   npm run worker             # required for document ingestion
   npm run dev -w @rag/web    # http://localhost:3000
   ```

3. Open **http://localhost:3000** → **Sign up** → create a **workspace** → upload a file → copy the **embed snippet**.

---

## Account & login

| Action | Where |
|--------|--------|
| Sign up | http://localhost:3000/signup |
| Log in | http://localhost:3000/login |
| Dashboard (workspaces) | http://localhost:3000/dashboard |

After login you get a JWT access token (short-lived) and refresh token. The web app stores them in `localStorage`.

**API (optional):**

- `POST /v1/auth/signup` — `{ "email", "password" }`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh` — `{ "refreshToken" }`
- `GET /v1/auth/me` — current user (requires `Authorization: Bearer …`)

---

## Workspaces

A **workspace** is one knowledge base + one embed widget (one website or customer).

1. From the dashboard, enter a name and click **Create workspace**.
2. Open the workspace card to manage documents and embed settings.

**Limits** depend on your **plan** (see [Plans & usage](#plans--usage)). Creating too many owned workspaces returns HTTP **402** with a limit code.

---

## Upload documents

Supported types: **PDF**, **DOCX**, **TXT**, **Markdown**.

1. Open a workspace → **Knowledge base** → choose a file → **Upload**.
2. Ensure **`npm run worker`** is running, or status stays at `pending` / `0%`.
3. When status is **completed**, the file is searchable for chat and embed.

**Re-ingest** (re-process an existing file without re-uploading):

- Click the **refresh** icon on a document row in the workspace UI.
- API: `POST /v1/workspaces/:workspaceId/documents/:documentId/reingest`

**Remove a document:** trash icon, or `DELETE /v1/workspaces/:workspaceId/documents/:documentId`.

**Safety checks (not full antivirus):**

- PDF/DOCX magic-byte validation
- Text files checked for unexpected binary content
- Plan max file size and total storage enforced

---

## Plans & usage

Your plan is stored on your user record (`users.plan`). Limits apply to **workspaces you own**.

| Plan | Workspaces (owned) | Docs / workspace | Storage / workspace | Max upload | Embed messages / month |
|------|------------------|------------------|---------------------|------------|-------------------------|
| **Free** | 2 | 5 | 50 MB | 10 MB | 200 |
| **Pro** | 10 | 50 | 500 MB | 50 MB | 5,000 |
| **Business** | 100 | 500 | 10 GB | 100 MB | 100,000 |

In the workspace UI, open **Plan & usage** to see meters vs these limits.

**Changing your plan:** ask a platform admin, or see [ADMIN.md](./ADMIN.md). End users cannot self-upgrade in the MVP.

**Typical limit errors (HTTP 402):**

| Code | Meaning |
|------|---------|
| `WORKSPACE_LIMIT` | Too many owned workspaces |
| `DOCUMENT_LIMIT` | Too many documents in this workspace |
| `STORAGE_LIMIT` | Total storage would exceed plan |
| `UPLOAD_TOO_LARGE` | Single file over plan max |
| `MESSAGE_LIMIT` | Monthly embed chat quota used |

---

## Embed widget (site chat)

### Get the snippet

1. Workspace page → **Embed widget** → **Copy snippet**.
2. Paste before `</body>` on any HTML site.

Example:

```html
<script
  src="http://localhost:4000/v1/embed/widget.js"
  data-workspace-id="YOUR_WORKSPACE_UUID"
  data-embed-key="YOUR_EMBED_KEY"
  data-primary-color="#4f46e5"
  data-position="right"
  data-button-label="Chat"
  async
></script>
```

### Preview

- In dashboard: **Preview chat** (opens `/embed/:workspaceId?key=…`).
- Or use the sample page in `demo-site/` (update workspace id and embed key in `demo-site/index.html`).

### Demo site (local HTTP)

Do **not** open `demo-site/index.html` as `file://` — the embed needs a real hostname for domain checks.

From the **repo root**:

```bash
npx --yes serve demo-site -p 8080
```

Then open **http://localhost:8080** and use the chat button.

If you use a **domain allowlist** on the workspace, add `localhost` under **Widget security & branding**.

### Visitor history

- Each visitor gets a `visitorId` in `localStorage`.
- Conversations persist; returning visitors see prior messages.
- API: `GET /v1/embed/conversations/:conversationId/messages?workspaceId&embedKey&visitorId`

### Domain allowlist

Under **Widget security & branding**, add allowed hostnames (one per line), e.g.:

```
example.com
www.example.com
localhost
```

- **Empty list** = allow all domains.
- The widget passes the parent page hostname to the API; requests from other domains get **403** `ORIGIN_NOT_ALLOWED`.

### Widget branding

Same settings section:

| Setting | Effect |
|---------|--------|
| Button label | Floating button text |
| Primary color | Button + chat header gradient |
| Position | Bottom-left or bottom-right |

Click **Save widget settings**, then copy the updated snippet if needed.

### Rotate embed key

**Rotate key** invalidates old snippets on live sites. Use after a leak or when offboarding a site.

---

## Environment variables (users / deployers)

Set in repo root `.env` (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `AI_PROVIDER` | `openai` or `gemini` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | LLM + embeddings |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Ingestion queue |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Auth |
| `NEXT_PUBLIC_API_URL` | Web → API (e.g. `http://localhost:4000`) |
| `EMBED_WIDGET_ORIGIN` | API: iframe origin (e.g. `http://localhost:3000`) |
| `PUBLIC_API_URL` | API: script `src` URL for embed snippet |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Ingestion stuck at 0% | Start `npm run worker` |
| Upload fails with 402 | Check plan usage; delete docs or ask admin to upgrade plan |
| Embed chat errors | Confirm API is up, embed key matches, domain is allowlisted |
| Gemini API key errors | Use an AI Studio key (`AIza…`); see `.env.example` |
| Preview blocked by allowlist | Add `localhost` to allowed domains |

---

## API reference (workspace owner)

All require `Authorization: Bearer <access_token>` unless noted.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/workspaces` | List workspaces |
| POST | `/v1/workspaces` | Create workspace |
| GET | `/v1/workspaces/:id` | Workspace details |
| GET | `/v1/workspaces/:id/usage` | Plan + usage meters |
| PATCH | `/v1/workspaces/:id/settings` | Domains + widget settings |
| POST | `/v1/workspaces/:id/documents/upload` | Multipart `file` |
| GET | `/v1/workspaces/:id/documents` | List documents |
| POST | `/v1/workspaces/:id/documents/:docId/reingest` | Re-queue ingestion |
| DELETE | `/v1/workspaces/:id/documents/:docId` | Delete document |
| GET | `/v1/workspaces/:id/embed` | Embed snippet + keys |
| POST | `/v1/workspaces/:id/embed/rotate-key` | New embed key |
| GET | `/v1/plans` | Plan catalog |

**Public embed (no user JWT):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/embed/widget.js` | Loader script |
| GET | `/v1/embed/workspaces/:id/config?embedKey=` | Widget branding |
| POST | `/v1/embed/chat/stream` | SSE chat |
| GET | `/v1/embed/conversations/:id/messages` | Visitor history |

---

## Next steps

- Platform operators: [ADMIN.md](./ADMIN.md)
- Architecture deep dive: [HOW_IT_WORKS.md](../HOW_IT_WORKS.md)
