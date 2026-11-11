// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * chunk-util.ts — Cắt tài liệu thành chunk cho RAG (Đợt 1).
 * Gói theo đoạn văn (\n\n), mỗi chunk ~maxChars, có overlap để không mất ngữ cảnh
 * ở ranh giới. Đoạn quá dài bị cắt cứng.
 */
export function chunkText(text: string, opts?: { maxChars?: number; overlap?: number }): string[] {
  const maxChars = opts?.maxChars ?? 1600; // ~400-500 token tiếng Việt
  const overlap = opts?.overlap ?? 200;
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  const paras = clean.split(/\n\n+/);
  let cur = '';
  for (const p of paras) {
    if (cur && (cur.length + 2 + p.length) > maxChars) {
      chunks.push(cur.trim());
      cur = cur.slice(Math.max(0, cur.length - overlap)) + '\n\n' + p; // overlap phần đuôi
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
    // Đoạn đơn khổng lồ → cắt cứng.
    while (cur.length > maxChars * 1.5) {
      chunks.push(cur.slice(0, maxChars).trim());
      cur = cur.slice(maxChars - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter((c) => c.length > 0);
}
