-- Phase 1 Marketing (ADR-001): index audit — thêm index đọc/dedup cho facade.
-- Additive thuần: chỉ CREATE INDEX, KHÔNG đụng dữ liệu/cột. An toàn chạy trên
-- production đang có dữ liệu (prisma migrate deploy). Tên index khớp convention
-- Prisma để không phát sinh drift.

-- content_blocks: ordering list theo org + createdAt desc (GET /api/v1/marketing/blocks)
CREATE INDEX "content_blocks_org_id_created_at_idx" ON "content_blocks"("org_id", "created_at" DESC);

-- automation_sequences: ordering list theo org + createdAt desc (facade + community route)
CREATE INDEX "automation_sequences_org_id_created_at_idx" ON "automation_sequences"("org_id", "created_at" DESC);

-- customer_list_entries: lookup/dedup theo Zalo UID + đối chiếu contact
CREATE INDEX "customer_list_entries_zalo_uid_idx" ON "customer_list_entries"("zalo_uid");
CREATE INDEX "customer_list_entries_contact_id_idx" ON "customer_list_entries"("contact_id");
