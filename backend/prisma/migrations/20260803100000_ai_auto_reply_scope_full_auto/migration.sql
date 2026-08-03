-- Auto-reply organization scope + full-auto mode (2026-08-03).
-- Additive only: defaults preserve the existing per-conversation/manual behavior.

ALTER TABLE "ai_configs"
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_scope" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_full_auto" BOOLEAN NOT NULL DEFAULT false;
