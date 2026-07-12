-- Phase 2 Marketing (Community): snapshot audience cho Broadcast run.
-- Additive: chỉ thêm cột mới, KHÔNG xoá/sửa dữ liệu cũ.
-- Run cũ (audience_snapshot_at NULL) tiếp tục chạy theo live-pick như trước.

ALTER TABLE "broadcast_runs"
    ADD COLUMN "audience_snapshot_at" TIMESTAMP(3),
    ADD COLUMN "queued_count" INTEGER NOT NULL DEFAULT 0;
