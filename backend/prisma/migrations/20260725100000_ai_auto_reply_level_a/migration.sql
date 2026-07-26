-- Auto-tư vấn Mức A (2026-07-25) — migration ADDITIVE, mặc định TẮT.
-- Không đổi/không xóa cột nào đang có → hành vi hệ thống y hệt trước khi ai bật công tắc.

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ai_configs"
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_global_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_sensitive_pattern" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_start_hour" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_end_hour" INTEGER NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_max_consecutive" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "ai_auto_reply_min_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.55;
