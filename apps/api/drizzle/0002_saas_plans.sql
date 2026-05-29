ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" varchar(32) NOT NULL DEFAULT 'free';

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "allowed_domains" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "widget_settings" jsonb DEFAULT '{}'::jsonb;
