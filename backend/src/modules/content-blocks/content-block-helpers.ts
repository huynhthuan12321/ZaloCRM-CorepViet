// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * content-block-helpers.ts — logic THUẦN (không I/O) cho Khối nội dung Phase 3.
 *
 * Tách khỏi routes để unit-test được: chuẩn hoá variants, đồng bộ variants[0] với
 * messageText/imageUrl (worker gửi vẫn đọc messageText — giữ nguyên, dry-run an toàn),
 * validate loại khối + biến {{...}}.
 */

export const BLOCK_TYPES = ['send_message', 'request_friend', 'status_change'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// Biến hợp lệ backend render được (broadcast-service.renderMessage). Khớp với FE.
export const BLOCK_VARS = ['ten', 'ten_khach', 'sdt', 'phone'] as const;

export type BlockVariant = { text: string; imageUrl: string | null };

export function normalizeBlockType(value: unknown): BlockType {
  const v = String(value ?? '').trim();
  return (BLOCK_TYPES as readonly string[]).includes(v) ? (v as BlockType) : 'send_message';
}

/** Biến {{xxx}} không nằm trong whitelist → trả về danh sách để chặn lúc lưu. */
export function unknownVars(text: string): string[] {
  const found = [...String(text ?? '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((v) => !(BLOCK_VARS as readonly string[]).includes(v)))];
}

function coerceVariant(row: unknown): BlockVariant | null {
  if (typeof row === 'string') {
    const text = row.trim();
    return text ? { text, imageUrl: null } : null;
  }
  if (!row || typeof row !== 'object') return null;
  const obj = row as Record<string, unknown>;
  const text = String(obj.text ?? obj.messageText ?? '').trim();
  const imageUrlRaw = obj.imageUrl;
  const imageUrl = typeof imageUrlRaw === 'string' && imageUrlRaw.trim() ? imageUrlRaw.trim() : null;
  if (!text && !imageUrl) return null;
  return { text, imageUrl };
}

/**
 * Chuẩn hoá danh sách variants từ input tự do. Nếu rỗng mà có messageText/imageUrl
 * (payload kiểu cũ) thì tạo 1 variant từ đó → tương thích ngược. Tối đa 20 biến thể.
 */
export function normalizeVariants(
  variants: unknown,
  fallbackText = '',
  fallbackImageUrl: string | null = null,
): BlockVariant[] {
  const raw = Array.isArray(variants) ? variants : [];
  const list = raw.map(coerceVariant).filter((v): v is BlockVariant => v !== null);
  if (list.length) return list.slice(0, 20);
  const text = fallbackText.trim();
  const img = fallbackImageUrl?.trim() || null;
  return text || img ? [{ text, imageUrl: img }] : [];
}

export type NormalizedBlockContent = {
  variants: BlockVariant[];
  messageText: string; // = variants[0].text — worker gửi đọc field này (giữ nguyên)
  imageUrl: string | null; // = variants[0].imageUrl
};

/**
 * Đồng bộ nội dung khối: variants[0] là nguồn cho messageText/imageUrl để KHÔNG phá
 * worker gửi hiện tại (broadcast-cron/resolveJobContent đọc messageText/imageUrl).
 * Trả về null nếu không có nội dung hợp lệ nào (caller báo lỗi).
 */
export function buildBlockContent(
  variants: unknown,
  fallbackText = '',
  fallbackImageUrl: string | null = null,
): NormalizedBlockContent | null {
  const normalized = normalizeVariants(variants, fallbackText, fallbackImageUrl);
  if (!normalized.length) return null;
  return {
    variants: normalized,
    messageText: normalized[0].text,
    imageUrl: normalized[0].imageUrl,
  };
}
