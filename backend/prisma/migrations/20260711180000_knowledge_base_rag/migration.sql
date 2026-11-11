-- Knowledge base RAG (Trợ lý AI Bất động sản) — Đợt 1 2026-07-11.
-- Additive: thêm 2 cột embed vào ai_configs + 2 bảng knowledge. Không pgvector
-- (embedding lưu JSONB float[], in-JS cosine).

ALTER TABLE "ai_configs"
    ADD COLUMN "embed_provider" TEXT,
    ADD COLUMN "embed_model" TEXT;

CREATE TABLE "knowledge_docs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'text',
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_docs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_docs_org_id_created_at_idx" ON "knowledge_docs"("org_id", "created_at");

CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB NOT NULL DEFAULT '[]',
    "embed_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_chunks_org_id_idx" ON "knowledge_chunks"("org_id");
CREATE INDEX "knowledge_chunks_doc_id_chunk_index_idx" ON "knowledge_chunks"("doc_id", "chunk_index");

-- Chunk xoá theo doc (cascade). Doc xoá theo org (cascade) — FK org ở tầng SQL cho gọn.
ALTER TABLE "knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_doc_id_fkey"
    FOREIGN KEY ("doc_id") REFERENCES "knowledge_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_docs"
    ADD CONSTRAINT "knowledge_docs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
