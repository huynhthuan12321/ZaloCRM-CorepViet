// Module dùng chung: bóc 1 Block content thành danh sách tin nhắn cần gửi tuần tự.
// 2026-06-06 (Approach A office-hours) — tách từ block-routes.ts:resolve-for-send để
// engine send-message handler + endpoint /resolve-for-send dùng CHUNG một logic, không
// lệch nhau. Trả resolved[] theo ĐÚNG THỨ TỰ components, kèm styles (giữ format).
//
// Pure function — không đụng DB/HTTP. Random variant TRONG mỗi text component (đúng ý
// đồ variation), nhưng GIỮ ĐỦ mọi component (không pick 1).

export type ResolvedMessage =
  | { messageType: 'text'; payload: { text: string; styles: Array<{ st: string; start: number; len: number }> | null } }
  | { messageType: 'image'; payload: { url: string; caption?: string; mediaAssetId?: string } }
  | { messageType: 'album'; payload: { items: Array<{ url: string; caption?: string; mediaAssetId?: string }> } }
  | { messageType: 'file'; payload: { url: string; filename?: string; sizeBytes?: number; mimeType?: string; caption?: string; mediaAssetId?: string } }
  | { messageType: 'video'; payload: { url: string; thumbnailUrl?: string; durationSec?: number; caption?: string; mediaAssetId?: string } }
  | { messageType: 'friend_request'; payload: { greeting: string } }
  | { messageType: 'update_status'; payload: Record<string, unknown> };

export interface ResolveResult {
  ok: boolean;
  /** lý do khi !ok (vd 'BLOCK_EMPTY_TEXT') */
  error?: string;
  detail?: string;
  resolved: ResolvedMessage[];
}

function pickGreeting(content: Record<string, unknown>): string[] {
  // greetingVariants: string[] (chuẩn) HOẶC {text}[] (block cũ lưu rich)
  const raw = Array.isArray(content?.greetingVariants)
    ? (content.greetingVariants as Array<string | { text?: string }>)
    : [];
  return raw
    .map((g) => (typeof g === 'string' ? g : g && typeof g.text === 'string' ? g.text : ''))
    .filter((t) => t.trim().length > 0);
}

/**
 * Bóc Block content thành danh sách tin theo đúng thứ tự.
 * @param actionType  'send_message' | 'request_friend' | 'update_status'
 * @param content     block.content (Json)
 */
export function resolveBlockContent(
  actionType: string,
  content: Record<string, unknown>,
): ResolveResult {
  const resolved: ResolvedMessage[] = [];

  if (actionType === 'request_friend') {
    const greetings = pickGreeting(content);
    if (greetings.length === 0) {
      return { ok: false, error: 'BLOCK_EMPTY_TEXT', detail: 'Khối không có biến thể lời chào nào', resolved };
    }
    const pick = greetings[Math.floor(Math.random() * greetings.length)];
    resolved.push({ messageType: 'friend_request', payload: { greeting: pick } });
    return { ok: true, resolved };
  }

  if (actionType === 'send_message') {
    const components = Array.isArray(content?.components)
      ? (content.components as Array<Record<string, unknown>>)
      : [];
    // Legacy shape fallback: { textVariants: string[], attachments: [...] }
    const legacyTextVariants = Array.isArray(content?.textVariants) ? (content.textVariants as string[]) : null;
    const legacyAttachments = Array.isArray(content?.attachments)
      ? (content.attachments as Array<Record<string, unknown>>)
      : null;

    if (components.length === 0 && !legacyTextVariants && !legacyAttachments) {
      return { ok: false, error: 'BLOCK_EMPTY_TEXT', detail: 'Khối chưa có thành phần nào', resolved };
    }

    // Legacy text variants (1 tin random)
    if (legacyTextVariants && legacyTextVariants.length > 0) {
      const pick = legacyTextVariants[Math.floor(Math.random() * legacyTextVariants.length)];
      resolved.push({ messageType: 'text', payload: { text: pick, styles: null } });
    }

    // Shape MỚI: loop ĐỦ components theo thứ tự
    for (const c of components) {
      if (c.kind === 'text') {
        const def = c.defaultVariant as Record<string, unknown> | undefined;
        const variants = Array.isArray(c.variants) ? (c.variants as Array<Record<string, unknown>>) : [];
        const pool = [def, ...variants].filter(
          (v) => v && typeof (v as { text?: unknown }).text === 'string' && ((v as { text: string }).text).length > 0,
        ) as Array<{ text: string; styles?: Array<{ st: string; start: number; len: number }> }>;
        if (pool.length === 0) continue;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        resolved.push({
          messageType: 'text',
          payload: { text: pick.text, styles: Array.isArray(pick.styles) ? pick.styles : null },
        });
      } else if (c.kind === 'image') {
        if (typeof c.url === 'string' && c.url) {
          resolved.push({ messageType: 'image', payload: { url: c.url, caption: c.caption as string | undefined, mediaAssetId: c.mediaAssetId as string | undefined } });
        }
      } else if (c.kind === 'album') {
        // GĐ Block-media (2026-06-13 D3): giữ mediaAssetId per-item để bump usageCount khi gửi.
        const items = Array.isArray(c.items)
          ? (c.items as Array<{ url?: string; caption?: string; mediaAssetId?: string }>).filter((it) => it && typeof it.url === 'string' && it.url)
          : [];
        if (items.length > 0) {
          resolved.push({ messageType: 'album', payload: { items: items as Array<{ url: string; caption?: string; mediaAssetId?: string }> } });
        }
      } else if (c.kind === 'file') {
        if (typeof c.url === 'string' && c.url) {
          resolved.push({
            messageType: 'file',
            payload: {
              url: c.url,
              filename: c.filename as string | undefined,
              sizeBytes: c.sizeBytes as number | undefined,
              mimeType: c.mimeType as string | undefined,
              caption: c.caption as string | undefined,
              mediaAssetId: c.mediaAssetId as string | undefined,
            },
          });
        }
      } else if (c.kind === 'video') {
        if (typeof c.url === 'string' && c.url) {
          resolved.push({
            messageType: 'video',
            payload: {
              url: c.url,
              thumbnailUrl: c.thumbnailUrl as string | undefined,
              durationSec: c.durationSec as number | undefined,
              caption: c.caption as string | undefined,
              mediaAssetId: c.mediaAssetId as string | undefined,
            },
          });
        }
      }
    }

    // Legacy attachments
    if (legacyAttachments) {
      for (const a of legacyAttachments) {
        const kind = String(a.kind);
        if (kind === 'image') resolved.push({ messageType: 'image', payload: { url: String(a.url), caption: a.caption as string | undefined } });
        else if (kind === 'video') resolved.push({ messageType: 'video', payload: { url: String(a.url), thumbnailUrl: a.thumbnailUrl as string | undefined, caption: a.caption as string | undefined } });
        else if (kind === 'file') resolved.push({ messageType: 'file', payload: { url: String(a.url), filename: a.filename as string | undefined, caption: a.caption as string | undefined } });
      }
    }

    if (resolved.length === 0) {
      return { ok: false, error: 'BLOCK_EMPTY_TEXT', detail: 'Khối không có nội dung gửi được', resolved };
    }
    return { ok: true, resolved };
  }

  if (actionType === 'update_status') {
    resolved.push({ messageType: 'update_status', payload: content });
    return { ok: true, resolved };
  }

  return { ok: false, error: 'UNSUPPORTED', detail: `actionType '${actionType}' chưa hỗ trợ`, resolved };
}
