-- Phase 3 Marketing EE (2026-07-13) — Content Blocks nâng cấp: block_type, variants,
-- tags, folder, enabled. ADDITIVE THUẦN: chỉ ADD COLUMN có DEFAULT + CREATE INDEX,
-- KHÔNG sửa/xoá dữ liệu cũ. An toàn chạy trên production đang có dữ liệu
-- (prisma migrate deploy). Khối cũ tự nhận default: send_message / variants [] / enabled true.

ALTER TABLE "content_blocks" ADD COLUMN "block_type" TEXT NOT NULL DEFAULT 'send_message';
ALTER TABLE "content_blocks" ADD COLUMN "variants" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "content_blocks" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "content_blocks" ADD COLUMN "folder" TEXT;
ALTER TABLE "content_blocks" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- Lọc theo loại khối + trạng thái bật (picker Broadcast/Sequence chỉ lấy enabled).
CREATE INDEX "content_blocks_org_id_block_type_enabled_idx" ON "content_blocks"("org_id", "block_type", "enabled");
-- Lọc theo tag (dự án/mục đích).
CREATE INDEX "content_blocks_tags_idx" ON "content_blocks" USING GIN ("tags");
