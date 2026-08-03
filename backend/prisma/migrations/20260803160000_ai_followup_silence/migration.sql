-- AI follow-up after customer silence (A2, 2026-08-03).
-- Additive only; disabled by default to preserve existing behavior.

ALTER TABLE "ai_configs"
  ADD COLUMN IF NOT EXISTS "ai_followup_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_followup_silence_hours" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "ai_followup_max" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "ai_followup_cooldown_hours" INTEGER NOT NULL DEFAULT 24;
