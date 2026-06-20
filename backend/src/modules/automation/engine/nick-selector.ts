// ════════════════════════════════════════════════════════════════════════
// Sequence nick selector — Luồng Mục Tiêu (viết lại 2026-06-12).
//
// ════════════════════════════════════════════════════════════════════════
// LỊCH SỬ: file cũ có pickNickForTask() phục vụ task-worker.ts (DB-polling,
// đã XÓA cùng AutomationTask). Nhánh request_friend cũ đếm cap qua
// AutomationTask stub (luôn 0) — dead code, gỡ luôn. File giờ chỉ còn 1 hàm
// chọn nick cho đường event → sequence (materializeFromEvent).
// ════════════════════════════════════════════════════════════════════════
//
// CHỌN NICK — CHIA CỨNG THUẦN (anh chốt 2026-06-20, BỎ failover của bản sáng cùng ngày):
//   1. List nick được phép = trigger.segmentSpec.nickIds (sale cấu hình lúc tạo Mục tiêu
//      — tầng phân quyền Zalo scope). List rỗng → mọi nick connected trong org.
//   2. Pool = nick được-phép đang CONNECTED (resolveEligibleNicks). KHÔNG lọc Friend row,
//      KHÔNG lọc cap ở đây → giữ chia ĐỀU. Cap gửi tin do worker xử lý lúc gửi (guard quota
//      → hoãn 00:00), không loại nick ở bước phân để khỏi làm lệch tỉ lệ.
//   3. Materializer chia CỨNG round-robin: KH thứ i → nick i%n. Mỗi nick ôm phần của mình;
//      phần xấu (nhiều khách chặn / không-Zalo) thì CHỊU — KHÔNG failover, KHÔNG rebalance.
//   4. Materializer CHỈ gán nick + enqueue (nhẹ, KHÔNG gọi SDK → không treo). Tra UID + gửi
//      + ghi log sự cố do sequence-step-worker làm lúc gửi: nick được phân tự ensureUidForPair;
//      no_zalo/blocked → log 'sequence_step_failed' + bỏ KH (sót, chiến dịch sau bám lại);
//      offline/capped → retry/hoãn. → vì vậy file này KHÔNG còn tra UID ở bước phân.

import { prisma } from '../../../shared/database/prisma-client.js';
import { ensureUidForPair } from './ensure-uid.js';

export interface SequenceNickSelection {
  nickId: string;
  /** UID của KH trong nick này (zaloUidInNick) — gửi tin cần cái này */
  zaloUidInNick: string;
  reason: 'existing_friend' | 'resolved_uid';
}

/**
 * MANUAL (anh chốt D4 + 5 trụ cột #1): gắn tay khi đang chat → dùng CHÍNH nick đó.
 * ensureUidForPair resolve UID (có sẵn / tìm qua SĐT → tạo Friend row). KHÔNG random.
 *
 * @returns selection nếu gửi-được, hoặc { nickId:null, reason } với lý do rõ để
 *          manual-enroll báo sale NGAY (NO_PHONE/NO_ZALO/LOOKUP_CAPPED/NOT_CONNECTED).
 */
export async function resolveManualNickForContact(args: {
  orgId: string;
  nickId: string;
  contactId: string;
}): Promise<SequenceNickSelection | { nickId: null; reason: string }> {
  const r = await ensureUidForPair(args);
  if (!r.ok) return { nickId: null, reason: r.code };
  return {
    nickId: args.nickId,
    zaloUidInNick: r.uid,
    reason: r.source === 'existing_friend' ? 'existing_friend' : 'resolved_uid',
  };
}

/**
 * Pool nick để CHIA CỨNG round-robin — nick được-phép (allowedNickIds) đang CONNECTED.
 * List rỗng → mọi nick connected trong org. KHÔNG lọc Friend row / cap (xem ghi chú đầu
 * file): giữ chia ĐỀU; cap gửi tin để worker xử lý lúc gửi (guard quota → hoãn 00:00).
 *
 * @param allowedNickIds  trigger.segmentSpec.nickIds — null/empty = không giới hạn
 */
export async function resolveEligibleNicks(
  orgId: string,
  allowedNickIds?: string[] | null,
): Promise<string[]> {
  const allowed =
    allowedNickIds && allowedNickIds.length > 0 ? new Set(allowedNickIds) : null;

  const nicks = await prisma.zaloAccount.findMany({
    where: {
      orgId,
      status: 'connected',
      ...(allowed ? { id: { in: [...allowed] } } : {}),
    },
    select: { id: true },
  });
  return nicks.map((n) => n.id);
}
