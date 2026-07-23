// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * knowledge-service.ts — RAG cho Trợ lý AI Cờ Rếp Việt (Đợt 1).
 * ingest text → chunk → embed → lưu; ask → embed câu hỏi → in-JS cosine top-K →
 * nhồi vào prompt → generateText (chat provider). KHÔNG pgvector.
 */
import { prisma } from '../../../shared/database/prisma-client.js';
import { chunkText } from './chunk-util.js';
import { embedTexts, cosineSim } from './embedding-service.js';
import { getAiConfig, getProviderApiKey, generateText } from '../ai-service.js';
import { getProviderBaseUrl } from '../provider-registry.js';

const RAG_SYSTEM_PROMPT = `# Vai trò
Em là trợ lý tra cứu của đội sale Cờ Rếp Việt. Sale hỏi về sản phẩm, giá,
chính sách bán hàng, quy cách, đóng gói, giao hàng — em trả lời DỰA TRÊN tài liệu công ty được cung cấp.

# Quy tắc bắt buộc
1. Chỉ trả lời dựa trên "Tài liệu tham khảo" bên dưới. TUYỆT ĐỐI KHÔNG bịa số liệu.
2. Nếu tài liệu KHÔNG có thông tin được hỏi → nói rõ "Tài liệu chưa có thông tin này"
   và gợi ý sale bổ sung tài liệu, KHÔNG suy đoán.
3. Trả lời NGẮN GỌN, đúng trọng tâm, tiếng Việt thuần, xưng "em" gọi "anh/chị".
4. Nếu có số (giá, diện tích, chính sách) → trích đúng như tài liệu, không làm tròn tuỳ tiện.`;

/** Nạp 1 tài liệu (dán text) → chunk + embed + lưu. */
export async function ingestText(args: { orgId: string; title: string; text: string; createdById?: string | null }): Promise<{ id: string; chunkCount: number }> {
  const text = (args.text ?? '').trim();
  if (!text) throw new Error('EMPTY_TEXT');
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error('EMPTY_TEXT');

  const { vectors, model } = await embedTexts(args.orgId, chunks);
  if (vectors.length !== chunks.length) throw new Error('EMBED_COUNT_MISMATCH');

  const doc = await prisma.knowledgeDoc.create({
    data: {
      orgId: args.orgId,
      title: args.title.trim() || 'Tài liệu',
      sourceType: 'text',
      charCount: text.length,
      chunkCount: chunks.length,
      createdById: args.createdById ?? null,
    },
  });
  await prisma.knowledgeChunk.createMany({
    data: chunks.map((c, i) => ({
      orgId: args.orgId, docId: doc.id, chunkIndex: i, content: c,
      embedding: vectors[i] as unknown as object, embedModel: model,
    })),
  });
  return { id: doc.id, chunkCount: chunks.length };
}

export async function listDocs(orgId: string) {
  return prisma.knowledgeDoc.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, sourceType: true, charCount: true, chunkCount: true, createdAt: true },
  });
}

export async function deleteDoc(orgId: string, id: string): Promise<boolean> {
  const d = await prisma.knowledgeDoc.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!d) return false;
  await prisma.knowledgeDoc.delete({ where: { id } }); // cascade xoá chunk
  return true;
}

export type RetrievedChunk = { content: string; docId: string; docTitle: string; score: number };

/**
 * Truy hồi top-K chunk liên quan (embed query → cosine in-JS → join tên tài liệu).
 * Bản STRICT: throw EMBED_FAILED nếu embed lỗi — dùng nội bộ cho ragAnswer để giữ
 * nguyên hành vi cũ của /ai/knowledge/ask. Trả [] nếu KB rỗng.
 */
async function retrieveChunksStrict(args: { orgId: string; query: string; topK?: number }): Promise<RetrievedChunk[]> {
  const query = (args.query ?? '').trim();
  if (!query) return [];
  const topK = args.topK ?? 6;

  const { vectors } = await embedTexts(args.orgId, [query]);
  const qvec = vectors[0];
  if (!qvec || qvec.length === 0) throw new Error('EMBED_FAILED');

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { orgId: args.orgId },
    select: { id: true, docId: true, content: true, embedding: true },
  });
  if (chunks.length === 0) return [];

  const scored = chunks
    .map((c) => ({ c, score: cosineSim(qvec, (c.embedding as unknown as number[]) ?? []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const docIds = [...new Set(scored.map((s) => s.c.docId))];
  const docs = await prisma.knowledgeDoc.findMany({ where: { orgId: args.orgId, id: { in: docIds } }, select: { id: true, title: true } });
  const titleById = new Map(docs.map((d) => [d.id, d.title]));

  return scored.map((s) => ({
    content: s.c.content,
    docId: s.c.docId,
    docTitle: titleById.get(s.c.docId) ?? 'Tài liệu',
    score: s.score,
  }));
}

/**
 * Bản BEST-EFFORT cho các luồng khác (vd reply_draft): KHÔNG BAO GIỜ throw.
 * KB rỗng / chưa cấu hình embedding / embed lỗi → trả [].
 */
export async function retrieveRelevantChunks(args: { orgId: string; query: string; topK?: number }): Promise<RetrievedChunk[]> {
  try {
    return await retrieveChunksStrict(args);
  } catch {
    return [];
  }
}

/** Hỏi đáp RAG: embed câu hỏi → cosine top-K chunk → nhồi prompt → trả lời. */
export async function ragAnswer(args: { orgId: string; question: string; topK?: number }): Promise<{ answer: string; sources: string[]; chunksUsed: number }> {
  const question = (args.question ?? '').trim();
  if (!question) throw new Error('EMPTY_QUESTION');

  const scored = await retrieveChunksStrict({ orgId: args.orgId, query: question, topK: args.topK ?? 6 });
  if (scored.length === 0) {
    return { answer: 'Chưa có tài liệu nào trong knowledge base. Vào Cài đặt → Trợ lý AI để thêm tài liệu (bảng giá, chính sách bán hàng, thông tin sản phẩm...).', sources: [], chunksUsed: 0 };
  }

  const context = scored.map((s, i) => `[Đoạn ${i + 1}]\n${s.content}`).join('\n\n');

  const cfg = await getAiConfig(args.orgId);
  const apiKey = await getProviderApiKey(args.orgId, cfg.provider);
  if (!apiKey) throw new Error('CHAT_KEY_MISSING');
  const baseUrl = await getProviderBaseUrl(args.orgId, cfg.provider);

  const prompt = [
    '# Tài liệu tham khảo', context, '',
    '# Câu hỏi của sale', question, '',
    '# Yêu cầu', 'Trả lời ngắn gọn, dựa CHỦ YẾU trên tài liệu trên. Nếu tài liệu không có thông tin, nói rõ "Tài liệu chưa có thông tin này" thay vì bịa.',
  ].join('\n');

  const answer = await generateText(cfg.provider, apiKey, cfg.model, RAG_SYSTEM_PROMPT, prompt, 700, baseUrl);
  const sources = [...new Set(scored.map((s) => s.docId))];
  return { answer: (answer ?? '').trim(), sources, chunksUsed: scored.length };
}
