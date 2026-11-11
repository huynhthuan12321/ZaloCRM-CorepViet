// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { Conversation } from '@/composables/use-chat';
import type { ConversationContext } from './types';

/** Hàm thuần dựng dữ liệu hiển thị cho hàng hội thoại / header thread mobile. Không gọi API. */

function usable(s: string | null | undefined): s is string {
  return !!s && s.trim().length > 0 && s.trim().toLowerCase() !== 'unknown';
}

interface ContactAccessLike {
  role?: string;
  user?: { id?: string; fullName?: string | null; email?: string | null } | null;
}

export function conversationDisplayName(conv: Conversation): string {
  if (conv.threadType === 'group') {
    if (usable(conv.groupName)) return conv.groupName;
    if (usable(conv.contact?.fullName)) return conv.contact!.fullName!;
    return 'Nhóm Zalo';
  }
  // Giống ConversationList: ưu tiên tên gợi nhớ theo nick, rồi tên Zalo gốc.
  if (usable(conv.friendship?.aliasInNick)) return conv.friendship!.aliasInNick!;
  if (usable(conv.contact?.fullName)) return conv.contact!.fullName!;
  if (usable(conv.friendship?.zaloDisplayName)) return conv.friendship!.zaloDisplayName!;
  return 'Khách chưa có tên';
}

export function conversationAvatar(conv: Conversation): string | null {
  return conv.threadType === 'group' ? (conv.groupAvatarUrl ?? null) : (conv.contact?.avatarUrl ?? null);
}

/** Người phụ trách + số người cùng chăm (D-4). Không suy từ người gửi tin cuối. */
export function resolveOwner(conv: Conversation): { ownerName: string | null; ownerExtra: number } {
  const contact = conv.contact as (Conversation['contact'] & {
    contactAccess?: ContactAccessLike[];
    _count?: { contactAccess?: number };
  }) | null;
  if (!contact) return { ownerName: null, ownerExtra: 0 };
  const access = Array.isArray(contact.contactAccess) ? contact.contactAccess : [];
  let ownerName: string | null = contact.assignedUser?.fullName?.trim() || null;
  if (!ownerName && contact.assignedUserId) {
    ownerName = access.find(a => a.user?.id === contact.assignedUserId)?.user?.fullName?.trim() || null;
  }
  if (!ownerName) {
    ownerName = access.find(a => a.role === 'primary')?.user?.fullName?.trim() || null;
  }
  const total = contact._count?.contactAccess ?? access.length;
  return { ownerName, ownerExtra: Math.max(0, total - 1) };
}

export function buildConversationContext(conv: Conversation): ConversationContext {
  const { ownerName, ownerExtra } = resolveOwner(conv);
  const isChannel = !!conv.channelAccount;
  return {
    nickName: conv.zaloAccount?.displayName?.trim() || conv.channelAccount?.displayName?.trim() || 'Không rõ nick',
    channelLabel: isChannel ? 'Kênh thử nghiệm' : 'Zalo',
    ownerName,
    ownerExtra,
    archivedNick: !!conv.zaloAccount?.archivedAt,
    virtual: !!conv.isVirtual,
    privateNick: conv.zaloAccount?.privacyMode === 'main',
    isZalo: !isChannel,
  };
}

/** Văn bản người phụ trách: 'Lan (+2 cùng chăm)' hoặc 'Chưa phân công'. */
export function ownerLabel(ctx: Pick<ConversationContext, 'ownerName' | 'ownerExtra'>): string {
  if (!ctx.ownerName) return 'Chưa phân công';
  return ctx.ownerExtra > 0 ? `${ctx.ownerName} (+${ctx.ownerExtra} cùng chăm)` : ctx.ownerName;
}

const TYPE_LABEL: Record<string, string> = {
  image: 'Hình ảnh', sticker: 'Sticker', video: 'Video', voice: 'Tin thoại', audio: 'Tin thoại', gif: 'GIF',
  file: 'Tệp đính kèm', link: 'Liên kết', call: 'Cuộc gọi', qr_code: 'Mã QR', reminder: 'Nhắc hẹn', poll: 'Bình chọn',
  note: 'Ghi chú', forwarded: 'Tin chuyển tiếp', location: 'Vị trí', contact_card: 'Danh thiếp', rich: 'Tin có định dạng',
  bank_transfer: 'Chuyển khoản',
};

/** Xem trước tin cuối (đã redact theo privacy từ API). Chỉ chữ, không emoji; media -> nhãn loại. */
export function conversationPreview(conv: Conversation): string {
  const msg = conv.messages?.[0];
  if (!msg) return '';
  if (msg.isDeleted) return 'Tin nhắn đã thu hồi';
  const prefix = msg.senderType === 'self' ? 'Bạn: ' : '';
  const label = TYPE_LABEL[msg.contentType];
  if (label) return prefix + label;
  const text = (msg.content ?? '').replace(/\s+/g, ' ').trim();
  if (text.startsWith('{')) return prefix + 'Tin nhắn đặc biệt';
  return prefix + (text.length > 80 ? `${text.slice(0, 80)}…` : text);
}

/** Lý do khóa sheet đính kèm (chữ tiếng Việt), null = dùng được. Thứ tự: offline trước vì dễ hiểu nhất. */
export function attachmentLockReason(opts: {
  online: boolean;
  ctx: ConversationContext;
  sending: boolean;
  /** Nick Riêng tư của người khác (cùng điều kiện khóa composer: !canSendInConv). */
  privacyLocked?: boolean;
}): string | null {
  if (!opts.online) return 'Đang mất kết nối. Ảnh và tệp không xếp hàng chờ, hãy gửi lại khi có mạng.';
  if (!opts.ctx.isZalo) return 'Hội thoại này không phải Zalo nên chưa gửi được ảnh hoặc tệp.';
  if (opts.ctx.archivedNick) return 'Nick Zalo này đã bị xóa khỏi CRM, chỉ xem lại được lịch sử.';
  if (opts.ctx.virtual) return 'Đây là chat nội bộ, ảnh và tệp không được gửi đi Zalo.';
  if (opts.privacyLocked) return 'Nick này đang ở chế độ Riêng tư — chỉ chính chủ nick mới gửi được ảnh và tệp.';
  if (opts.sending) return 'Đang gửi tin, vui lòng đợi xong rồi thử lại.';
  return null;
}
