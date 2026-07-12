-- Khép kín Phase 3-4 Marketing (Community): worker gửi bước sequence + Target bám đuổi.
-- Additive: chỉ thêm cột/index mới, KHÔNG xoá/sửa dữ liệu cũ.

-- CareSession: con trỏ bước + lịch gửi + snapshot steps cho care-session-cron.
ALTER TABLE "care_sessions"
    ADD COLUMN "steps_snapshot" JSONB,
    ADD COLUMN "current_step_idx" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "next_run_at" TIMESTAMP(3),
    ADD COLUMN "last_sent_at" TIMESTAMP(3),
    ADD COLUMN "last_error" TEXT,
    ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "care_sessions_state_next_run_at_idx" ON "care_sessions"("state", "next_run_at");

-- TargetJob: luồng bám đuổi tự enroll khi khách chấp nhận kết bạn.
ALTER TABLE "target_jobs"
    ADD COLUMN "followup_sequence_id" TEXT,
    ADD COLUMN "followup_enrolled_count" INTEGER NOT NULL DEFAULT 0;
