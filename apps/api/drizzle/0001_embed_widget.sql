ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "embed_public_key" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_embed_public_key_unique"
  ON "workspaces" ("embed_public_key")
  WHERE "embed_public_key" IS NOT NULL;

ALTER TABLE "conversations" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "visitor_id" varchar(128);

CREATE INDEX IF NOT EXISTS "conversations_workspace_visitor_idx"
  ON "conversations" ("workspace_id", "visitor_id")
  WHERE "visitor_id" IS NOT NULL;
