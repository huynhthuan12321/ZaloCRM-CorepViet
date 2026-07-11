// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * embedding-service.ts — Sinh vector embedding cho knowledge base (Đợt 1 RAG).
 * Provider/model embedding cấu hình per-org (AiConfig.embedProvider/embedModel),
 * dùng lại key per-org của provider. Hỗ trợ Gemini (batchEmbedContents) và
 * OpenAI-compatible (/v1/embeddings, Qwen /compatible-mode/v1/embeddings).
 * In-JS cosine — KHÔNG pgvector.
 */
import { getAiConfig } from '../ai-service.js';
import { resolveProviderApiKey, getProviderBaseUrl } from '../provider-registry.js';

export interface EmbedConfig { provider: string; model: string; apiKey: string; baseUrl: string; }

function normalizeEmbedModel(provider: string, model: string): string {
  const clean = model.trim().replace(/^models\//, '');
  if (provider === 'gemini') {
    if (!clean || clean === 'text' || clean === 'embedding' || clean === 'text-embedding') {
      return 'gemini-embedding-001';
    }
  }
  return clean;
}

/** Lấy cấu hình embedding per-org. Throw mã lỗi rõ ràng nếu chưa cấu hình. */
export async function resolveEmbedConfig(orgId: string): Promise<EmbedConfig> {
  const cfg = await getAiConfig(orgId);
  const provider = cfg.embedProvider ?? '';
  const model = normalizeEmbedModel(provider, cfg.embedModel ?? '');
  if (!provider || !model) throw new Error('EMBED_NOT_CONFIGURED');
  const [apiKey, baseUrl] = await Promise.all([
    resolveProviderApiKey(orgId, provider),
    getProviderBaseUrl(orgId, provider),
  ]);
  if (!apiKey) throw new Error('EMBED_KEY_MISSING');
  return { provider, model, apiKey, baseUrl };
}

async function embedOpenAiCompat(baseUrl: string, apiKey: string, model: string, texts: string[], path: string): Promise<number[][]> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`embed HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  return (data.data ?? []).map((d) => d.embedding);
}

async function embedGemini(baseUrl: string, apiKey: string, model: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(`${baseUrl}/v1beta/models/${model}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: texts.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] } })) }),
  });
  if (!res.ok) throw new Error(`gemini embed HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
  return (data.embeddings ?? []).map((e) => e.values);
}

/** Embed nhiều đoạn text → mảng vector (cùng thứ tự). Batch 50/lần. */
export async function embedTexts(orgId: string, texts: string[]): Promise<{ vectors: number[][]; model: string }> {
  if (texts.length === 0) return { vectors: [], model: '' };
  const cfg = await resolveEmbedConfig(orgId);
  const BATCH = 50;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const vecs = cfg.provider === 'gemini'
      ? await embedGemini(cfg.baseUrl, cfg.apiKey, cfg.model, batch)
      : await embedOpenAiCompat(cfg.baseUrl, cfg.apiKey, cfg.model, batch, cfg.provider === 'qwen' ? '/compatible-mode/v1/embeddings' : '/v1/embeddings');
    out.push(...vecs);
  }
  return { vectors: out, model: cfg.model };
}

/** Cosine similarity 2 vector. Trả 0 nếu 1 trong 2 rỗng/độ dài lệch. */
export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
