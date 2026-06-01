/**
 * internal-contact-service.ts — Phase Internal Contact 2-method 2026-05-23.
 *
 * Sale chọn 1 trong 2 cách nhận system notification:
 *   - 'crm_nick'       : sale chọn nick OWN trong CRM → nick OWN sendFriendRequest tới
 *                        Nick Hệ Thống (sender). Sender auto accept (do CRM control).
 *                        Sau accept, sender gửi tin verify code, sale gõ lại trên CRM.
 *   - 'personal_phone' : sale nhập SĐT cá nhân không có trong CRM → sender findUser(phone)
 *                        rồi sendFriendRequest. Sale accept trên Zalo cá nhân. Polling
 *                        check accepted → sender gửi verify code, sale gõ lại.
 *
 * Source of truth UID = SystemNotifyRecipient.threadIdInSenderView (per (target, sender)).
 * Verify code 4 số, hash bằng sha-256, expire 30 phút, lock sau 5 lần sai.
 *
 * Spec đầy đủ: docs/DESIGN-INTERNAL-CONTACT-2METHOD.md
 */
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { zaloPool } from '../zalo/zalo-pool.js';

export type InternalContactMethod = 'crm_nick' | 'personal_phone';

const VERIFY_CODE_TTL_MS = 30 * 60 * 1000; // 30 phút
const VERIFY_ATTEMPTS_MAX = 5;
const RESEND_FRIEND_REQUEST_COOLDOWN_MS = 5 * 60 * 1000; // 5 phút
const RESEND_VERIFY_CODE_COOLDOWN_MS = 60 * 1000; // 1 phút
const FRIEND_ACCEPT_DELAY_MS = 2500; // delay 2.5s giữa A.send và S.accept (cách 1)

export class InternalContactError extends Error {
  constructor(public statusCode: number, public errorCode: string, message: string) {
    super(message);
  }
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateVerifyCode(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

function extractUid(findResult: unknown): string | null {
  const u = (findResult as Record<string, unknown>) || {};
  return String(u.uid || u.userId || '') || null;
}

interface SenderContext {
  senderId: string;
  senderPhone: string | null;
  senderZaloUid: string | null;
}

async function loadSender(orgId: string): Promise<SenderContext> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      systemNotifyZaloAccountId: true,
      systemNotifyNick: { select: { id: true, status: true, phone: true, zaloUid: true } },
    },
  });
  if (!org?.systemNotifyZaloAccountId || !org.systemNotifyNick) {
    throw new InternalContactError(400, 'org_not_configured', 'Admin chưa setup Nick Hệ Thống cho org');
  }
  if (org.systemNotifyNick.status !== 'connected') {
    throw new InternalContactError(503, 'system_sender_offline', 'Nick Hệ Thống đang offline, thử lại sau');
  }
  return {
    senderId: org.systemNotifyZaloAccountId,
    senderPhone: org.systemNotifyNick.phone,
    senderZaloUid: org.systemNotifyNick.zaloUid,
  };
}

/**
 * Resolve UID 2 chiều giữa nick A và nick S:
 *   - uidA_from_S: UID của A từ góc nhìn S (dùng để S gửi tin/friend req tới A)
 *   - uidS_from_A: UID của S từ góc nhìn A (dùng để A gửi friend req tới S)
 * Strategy (ưu tiên reliable nhất → fallback):
 *   1. Friend table — nếu đã từng accept friend trong DB
 *   2. zaloUid global — chấp nhận nếu Zalo SDK xài được UID global cho sendFriendRequest
 *   3. findUser by phone — cần phone, dùng cuối
 */
async function resolveBidirectionalUid(args: {
  orgId: string;
  nickAId: string;
  nickAPhone: string | null;
  nickAZaloUid: string | null;
  senderId: string;
  senderPhone: string | null;
  senderZaloUid: string | null;
}): Promise<{ uidA_from_S: string | null; uidS_from_A: string | null; source: string }> {
  // 1. Friend table (đã friend bao giờ)
  const friendAfromS = await prisma.friend.findFirst({
    where: { orgId: args.orgId, zaloAccountId: args.senderId, contact: { friends: { some: { zaloAccountId: args.nickAId } } } },
    select: { zaloUidInNick: true },
  });
  const friendSfromA = await prisma.friend.findFirst({
    where: { orgId: args.orgId, zaloAccountId: args.nickAId, contact: { friends: { some: { zaloAccountId: args.senderId } } } },
    select: { zaloUidInNick: true },
  });
  if (friendAfromS?.zaloUidInNick && friendSfromA?.zaloUidInNick) {
    return { uidA_from_S: friendAfromS.zaloUidInNick, uidS_from_A: friendSfromA.zaloUidInNick, source: 'friend_table' };
  }

  // 2. zaloUid global — best-effort, có thể fail nếu Zalo enforce per-viewer UID
  let uidA_from_S = friendAfromS?.zaloUidInNick ?? args.nickAZaloUid ?? null;
  let uidS_from_A = friendSfromA?.zaloUidInNick ?? args.senderZaloUid ?? null;

  // 3. findUser by phone fallback
  if (!uidA_from_S && args.nickAPhone) {
    try {
      const res = await zaloOps.findUser(args.senderId, normalizePhone(args.nickAPhone) || args.nickAPhone);
      uidA_from_S = extractUid(res);
    } catch (err: any) {
      logger.debug(`[internal-contact] findUser(A from S) fail: ${err?.message || err}`);
    }
  }
  if (!uidS_from_A && args.senderPhone) {
    try {
      const res = await zaloOps.findUser(args.nickAId, normalizePhone(args.senderPhone) || args.senderPhone);
      uidS_from_A = extractUid(res);
    } catch (err: any) {
      logger.debug(`[internal-contact] findUser(S from A) fail: ${err?.message || err}`);
    }
  }

  return { uidA_from_S, uidS_from_A, source: friendAfromS && friendSfromA ? 'partial_friend' : 'fallback' };
}

async function upsertRecipient(args: {
  orgId: string;
  targetUserId: string;
  senderId: string;
  internalContactZaloAccountId: string | null;
  threadIdInSenderView?: string | null;
  status: string;
  error?: string | null;
  verifyCode?: string | null;
  verifyCodeExpiresAt?: Date | null;
  verifyAttempts?: number;
  friendRequestSentAt?: Date | null;
}) {
  return prisma.systemNotifyRecipient.upsert({
    where: {
      targetUserId_senderZaloAccountId: {
        targetUserId: args.targetUserId,
        senderZaloAccountId: args.senderId,
      },
    },
    create: {
      id: randomUUID(),
      orgId: args.orgId,
      targetUserId: args.targetUserId,
      senderZaloAccountId: args.senderId,
      internalContactZaloAccountId: args.internalContactZaloAccountId,
      threadIdInSenderView: args.threadIdInSenderView ?? null,
      status: args.status,
      error: args.error ?? null,
      verifyCode: args.verifyCode ?? null,
      verifyCodeExpiresAt: args.verifyCodeExpiresAt ?? null,
      verifyAttempts: args.verifyAttempts ?? 0,
      friendRequestSentAt: args.friendRequestSentAt ?? null,
      lastVerifiedAt: new Date(),
    },
    update: {
      internalContactZaloAccountId: args.internalContactZaloAccountId,
      threadIdInSenderView: args.threadIdInSenderView,
      status: args.status,
      error: args.error ?? null,
      verifyCode: args.verifyCode,
      verifyCodeExpiresAt: args.verifyCodeExpiresAt,
      verifyAttempts: args.verifyAttempts,
      friendRequestSentAt: args.friendRequestSentAt,
      lastVerifiedAt: new Date(),
    },
  });
}

function buildFriendRequestMessage(targetUserName: string | null, _method: InternalContactMethod): string {
  return `Xin chào${targetUserName ? ' ' + targetUserName : ''}! Đây là Nick Hệ Thống CRM. Chấp nhận lời mời để nhận thông báo công việc từ CRM (KH đồng ý kết bạn, lịch hẹn, cảnh báo silent...). Mọi tin nhắn cá nhân của bạn KHÔNG được CRM đọc.`;
}

function buildVerifyMessage(code: string): string {
  return `Mã xác nhận thiết lập nhận thông báo hệ thống: ${code}\n\nGõ lại mã 4 số này trên CRM để hoàn tất. Mã hết hạn sau 30 phút.`;
}

async function sendVerifyCode(args: {
  senderId: string;
  threadIdInSenderView: string;
  code: string;
}) {
  const api = zaloPool.getApi(args.senderId);
  if (!api) {
    throw new InternalContactError(503, 'sender_pool_missing', 'Nick Hệ Thống chưa connected trong Zalo pool');
  }
  await api.sendMessage({ msg: buildVerifyMessage(args.code) }, args.threadIdInSenderView, 0);
}

/**
 * Cách 1 — Sale chọn nick OWN. Flow handshake:
 * 1. Validate nick OWN connected + có phone hoặc đã friend với sender.
 * 2. Resolve UID 2 chiều (S↔A) qua findUser by phone, hoặc Friend table nếu đã friend.
 * 3. A.sendFriendRequest(uidS_from_A)
 * 4. Delay 2.5s, S.acceptFriendRequest(uidA_from_S)
 * 5. Generate verify code, S.sendMessage(code, uidA_from_S)
 * 6. Persist threadIdInSenderView = uidA_from_S, status=pending_user_confirm.
 */
export async function initiateCrmNickHandshake(args: {
  orgId: string;
  userId: string;
  userFullName: string | null;
  zaloAccountId: string;
}) {
  const { orgId, userId, zaloAccountId } = args;

  // 1. Validate nick OWN
  const nickA = await prisma.zaloAccount.findFirst({
    where: { id: zaloAccountId, orgId, ownerUserId: userId },
    select: { id: true, status: true, phone: true, displayName: true, zaloUid: true },
  });
  if (!nickA) {
    throw new InternalContactError(404, 'nick_not_owned', 'Bạn không sở hữu nick này');
  }
  if (nickA.status !== 'connected') {
    throw new InternalContactError(400, 'nick_offline', 'Nick này đang offline, đăng nhập lại trước khi setup');
  }

  // 2. Validate sender
  const { senderId, senderPhone, senderZaloUid } = await loadSender(orgId);
  if (nickA.id === senderId) {
    throw new InternalContactError(400, 'nick_is_sender', 'Không thể dùng chính Nick Hệ Thống làm nick nhận');
  }

  // 3. Resolve UID 2 chiều — Friend table → zaloUid global → findUser by phone
  const { uidA_from_S, uidS_from_A, source } = await resolveBidirectionalUid({
    orgId, nickAId: nickA.id, nickAPhone: nickA.phone, nickAZaloUid: nickA.zaloUid,
    senderId, senderPhone, senderZaloUid,
  });
  if (!uidA_from_S || !uidS_from_A) {
    await upsertRecipient({
      orgId, targetUserId: userId, senderId,
      internalContactZaloAccountId: nickA.id,
      status: 'uid_not_found',
      error: 'Không tìm được UID giữa 2 nick (Friend table chưa có + thiếu SĐT). Sync nick + retry.',
    });
    throw new InternalContactError(503, 'uid_not_found', 'Không tìm được UID giữa 2 nick. Yêu cầu admin sync nick hoặc thử lại sau.');
  }

  const skipFriendRequest = source === 'friend_table';

  if (!skipFriendRequest) {
    // 4. A.sendFriendRequest → S
    const msg = buildFriendRequestMessage(args.userFullName, 'crm_nick');
    try {
      await zaloOps.sendFriendRequest(nickA.id, msg, uidS_from_A);
    } catch (err: any) {
      await upsertRecipient({
        orgId, targetUserId: userId, senderId,
        internalContactZaloAccountId: nickA.id,
        threadIdInSenderView: uidA_from_S,
        status: 'lookup_failed',
        error: `Gửi lời mời kết bạn thất bại: ${err?.message || err}`,
      });
      throw new InternalContactError(503, 'send_friend_request_failed', err?.message || 'Gửi lời mời kết bạn thất bại');
    }

    // 5. Delay 2.5s, S.acceptFriendRequest(uidA_from_S)
    await new Promise((resolve) => setTimeout(resolve, FRIEND_ACCEPT_DELAY_MS));
    try {
      await zaloOps.acceptFriendRequest(senderId, uidA_from_S);
    } catch (err: any) {
      // Có thể fail nếu friend request chưa đến — vẫn tiếp tục, sale có thể retry
      logger.warn(`[internal-contact] sender auto-accept failed (sẽ retry sau): ${err?.message || err}`);
    }
  }

  // 6. Generate + send verify code
  const code = generateVerifyCode();
  try {
    await sendVerifyCode({ senderId, threadIdInSenderView: uidA_from_S, code });
  } catch (err: any) {
    await upsertRecipient({
      orgId, targetUserId: userId, senderId,
      internalContactZaloAccountId: nickA.id,
      threadIdInSenderView: uidA_from_S,
      status: 'pending_friend_request',
      error: `Chưa gửi được tin verify (có thể chưa friend xong): ${err?.message || err}`,
      friendRequestSentAt: skipFriendRequest ? null : new Date(),
    });
    throw new InternalContactError(503, 'send_verify_failed', 'Đã gửi lời mời kết bạn nhưng chưa gửi được tin verify. Kiểm tra Zalo accept rồi bấm "Gửi lại mã".');
  }

  // 7. Persist pending_user_confirm
  const recipient = await upsertRecipient({
    orgId, targetUserId: userId, senderId,
    internalContactZaloAccountId: nickA.id,
    threadIdInSenderView: uidA_from_S,
    status: 'pending_user_confirm',
    error: null,
    verifyCode: hashCode(code),
    verifyCodeExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
    verifyAttempts: 0,
    friendRequestSentAt: skipFriendRequest ? null : new Date(),
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      internalContactMethod: 'crm_nick',
      internalContactZaloAccountId: nickA.id,
      internalContactPhone: null,
      internalContactSetupAt: new Date(),
      internalContactConfirmedAt: null,
    },
  });

  return { recipient, skippedFriendRequest: skipFriendRequest };
}

/**
 * Cách 2 — Sale nhập SĐT personal. Flow handshake:
 * 1. Validate phone format + không trùng nick OWN khác trong CRM.
 * 2. S.findUser(phone) → uid_personal_from_S
 * 3. S.sendFriendRequest(uid)
 * 4. Chờ sale accept trên Zalo cá nhân (polling qua POST /check-handshake).
 *    Sau accepted: S.sendMessage(verifyCode, uid), status=pending_user_confirm.
 */
export async function initiatePersonalPhoneHandshake(args: {
  orgId: string;
  userId: string;
  userFullName: string | null;
  rawPhone: string;
}) {
  const { orgId, userId, rawPhone } = args;
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new InternalContactError(400, 'phone_invalid', 'SĐT không hợp lệ');
  }

  // Trùng nick OWN trong org?
  const collidingNick = await prisma.zaloAccount.findFirst({
    where: { orgId, phone: { in: [phone, rawPhone.replace(/\s/g, '')] } },
    select: { id: true, displayName: true, ownerUserId: true },
  });
  if (collidingNick) {
    throw new InternalContactError(
      400,
      'phone_already_in_crm',
      `SĐT này thuộc nick "${collidingNick.displayName || 'không tên'}" đã có trong CRM. Dùng Cách 1 hiệu quả hơn.`,
    );
  }

  const { senderId } = await loadSender(orgId);

  // findUser
  let uid: string | null;
  try {
    uid = extractUid(await zaloOps.findUser(senderId, phone));
  } catch (err: any) {
    await upsertRecipient({
      orgId, targetUserId: userId, senderId,
      internalContactZaloAccountId: null,
      status: 'lookup_failed',
      error: err?.message || 'findUser lỗi',
    });
    throw new InternalContactError(503, 'lookup_failed', err?.message || 'Không tìm được UID');
  }
  if (!uid) {
    await upsertRecipient({
      orgId, targetUserId: userId, senderId,
      internalContactZaloAccountId: null,
      status: 'uid_not_found',
      error: 'SĐT này không có Zalo hoặc Zalo từ chối lookup',
    });
    throw new InternalContactError(404, 'uid_not_found', 'SĐT này không có Zalo hoặc Zalo từ chối tìm');
  }

  // sendFriendRequest
  const fullName = args.userFullName ?? null;
  const msg = buildFriendRequestMessage(fullName, 'personal_phone');
  try {
    await zaloOps.sendFriendRequest(senderId, msg, uid);
  } catch (err: any) {
    await upsertRecipient({
      orgId, targetUserId: userId, senderId,
      internalContactZaloAccountId: null,
      threadIdInSenderView: uid,
      status: 'lookup_failed',
      error: `Gửi friend request thất bại: ${err?.message || err}`,
    });
    throw new InternalContactError(503, 'send_friend_request_failed', err?.message || 'Gửi friend request thất bại');
  }

  // Persist pending_friend_request — chờ sale accept trên Zalo cá nhân
  const recipient = await upsertRecipient({
    orgId, targetUserId: userId, senderId,
    internalContactZaloAccountId: null,
    threadIdInSenderView: uid,
    status: 'pending_friend_request',
    error: 'Đang chờ bạn chấp nhận lời mời trên Zalo cá nhân',
    friendRequestSentAt: new Date(),
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      internalContactMethod: 'personal_phone',
      internalContactZaloAccountId: null,
      internalContactPhone: phone,
      internalContactSetupAt: new Date(),
      internalContactConfirmedAt: null,
    },
  });

  return { recipient, uid };
}

/**
 * Polling check — gọi từ frontend mỗi 5s khi đang ở step 2 cách 2.
 * Nếu Zalo report friend đã accepted → gửi verify code → status=pending_user_confirm.
 */
export async function checkHandshakeStatus(args: { orgId: string; userId: string }) {
  const user = await prisma.user.findFirst({
    where: { id: args.userId, orgId: args.orgId },
    select: {
      internalContactMethod: true,
      internalContactZaloAccountId: true,
      internalContactPhone: true,
    },
  });
  if (!user?.internalContactMethod) {
    throw new InternalContactError(404, 'no_setup', 'Chưa khởi tạo setup');
  }

  const { senderId } = await loadSender(args.orgId);
  const recipient = await prisma.systemNotifyRecipient.findUnique({
    where: { targetUserId_senderZaloAccountId: { targetUserId: args.userId, senderZaloAccountId: senderId } },
  });
  if (!recipient) {
    throw new InternalContactError(404, 'recipient_missing', 'Không tìm thấy recipient');
  }
  if (recipient.status !== 'pending_friend_request' || !recipient.threadIdInSenderView) {
    // Đã xong hoặc fail — return luôn
    return { recipient };
  }

  // Check friend request status từ phía sender
  let accepted = false;
  try {
    const status = await zaloOps.getFriendRequestStatus(senderId, recipient.threadIdInSenderView);
    const s = status as Record<string, unknown>;
    // zca-js trả 'accepted' | 'pending' | 'rejected' (tham khảo doc)
    const statusStr = String(s.status || s.state || '').toLowerCase();
    accepted = statusStr === 'accepted' || statusStr === 'success' || statusStr === '1';
  } catch (err: any) {
    logger.debug(`[internal-contact] check friend status err: ${err?.message || err}`);
  }

  // Fallback: query Friend table — friend-event-handler có thể đã upsert
  if (!accepted) {
    const friend = await prisma.friend.findFirst({
      where: {
        zaloAccountId: senderId,
        zaloUidInNick: recipient.threadIdInSenderView,
        friendshipStatus: 'accepted',
      },
      select: { id: true },
    });
    accepted = Boolean(friend);
  }

  if (!accepted) {
    return { recipient };
  }

  // Accepted → gửi verify code
  const code = generateVerifyCode();
  try {
    await sendVerifyCode({ senderId, threadIdInSenderView: recipient.threadIdInSenderView, code });
  } catch (err: any) {
    return { recipient: await upsertRecipient({
      orgId: args.orgId, targetUserId: args.userId, senderId,
      internalContactZaloAccountId: recipient.internalContactZaloAccountId,
      threadIdInSenderView: recipient.threadIdInSenderView,
      status: 'pending_friend_request',
      error: `Đã friend nhưng chưa gửi được tin verify: ${err?.message || err}`,
    }) };
  }

  const updated = await upsertRecipient({
    orgId: args.orgId, targetUserId: args.userId, senderId,
    internalContactZaloAccountId: recipient.internalContactZaloAccountId,
    threadIdInSenderView: recipient.threadIdInSenderView,
    status: 'pending_user_confirm',
    error: null,
    verifyCode: hashCode(code),
    verifyCodeExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
    verifyAttempts: 0,
    friendRequestSentAt: recipient.friendRequestSentAt,
  });

  return { recipient: updated };
}

/**
 * Sale gõ verify code → confirm. Compare hash, check expire + attempts lock.
 */
export async function confirmVerifyCode(args: { orgId: string; userId: string; code: string }) {
  const code = (args.code || '').trim();
  if (!/^\d{4}$/.test(code)) {
    throw new InternalContactError(400, 'code_format', 'Mã phải là 4 chữ số');
  }

  const { senderId } = await loadSender(args.orgId);
  const recipient = await prisma.systemNotifyRecipient.findUnique({
    where: { targetUserId_senderZaloAccountId: { targetUserId: args.userId, senderZaloAccountId: senderId } },
  });
  if (!recipient) {
    throw new InternalContactError(404, 'recipient_missing', 'Không tìm thấy recipient');
  }
  if (recipient.status !== 'pending_user_confirm') {
    throw new InternalContactError(400, 'wrong_state', `Trạng thái hiện tại không cho verify (${recipient.status})`);
  }
  if (recipient.verifyAttempts >= VERIFY_ATTEMPTS_MAX) {
    throw new InternalContactError(429, 'attempts_locked', `Đã sai ${VERIFY_ATTEMPTS_MAX} lần. Vui lòng bấm "Gửi lại mã".`);
  }
  if (!recipient.verifyCode || !recipient.verifyCodeExpiresAt || recipient.verifyCodeExpiresAt < new Date()) {
    throw new InternalContactError(410, 'code_expired', 'Mã đã hết hạn, vui lòng gửi lại');
  }

  if (hashCode(code) !== recipient.verifyCode) {
    const attempts = recipient.verifyAttempts + 1;
    await prisma.systemNotifyRecipient.update({
      where: { id: recipient.id },
      data: { verifyAttempts: attempts },
    });
    throw new InternalContactError(
      400,
      'code_wrong',
      `Mã không đúng. Còn ${VERIFY_ATTEMPTS_MAX - attempts} lần thử.`,
    );
  }

  // OK
  const updated = await prisma.systemNotifyRecipient.update({
    where: { id: recipient.id },
    data: {
      status: 'ready',
      error: null,
      verifyCode: null,
      verifyCodeExpiresAt: null,
      verifyAttempts: 0,
      lastVerifiedAt: new Date(),
    },
  });
  await prisma.user.update({
    where: { id: args.userId },
    data: { internalContactConfirmedAt: new Date() },
  });
  return { recipient: updated };
}

/**
 * Gửi lại friend request. Rate-limit 1 lần / 5 phút (chống Zalo flag).
 */
export async function resendFriendRequest(args: { orgId: string; userId: string }) {
  const user = await prisma.user.findFirst({
    where: { id: args.userId, orgId: args.orgId },
    select: { id: true, fullName: true, internalContactMethod: true, internalContactZaloAccountId: true, internalContactPhone: true },
  });
  if (!user?.internalContactMethod) {
    throw new InternalContactError(404, 'no_setup', 'Chưa khởi tạo setup');
  }

  const { senderId } = await loadSender(args.orgId);
  const existing = await prisma.systemNotifyRecipient.findUnique({
    where: { targetUserId_senderZaloAccountId: { targetUserId: args.userId, senderZaloAccountId: senderId } },
  });
  if (existing?.friendRequestSentAt) {
    const elapsed = Date.now() - existing.friendRequestSentAt.getTime();
    if (elapsed < RESEND_FRIEND_REQUEST_COOLDOWN_MS) {
      const waitMs = RESEND_FRIEND_REQUEST_COOLDOWN_MS - elapsed;
      throw new InternalContactError(429, 'resend_cooldown', `Vui lòng đợi ${Math.ceil(waitMs / 1000)}s nữa để gửi lại lời mời`);
    }
  }

  if (user.internalContactMethod === 'crm_nick' && user.internalContactZaloAccountId) {
    return initiateCrmNickHandshake({
      orgId: args.orgId,
      userId: args.userId,
      userFullName: user.fullName,
      zaloAccountId: user.internalContactZaloAccountId,
    });
  }
  if (user.internalContactMethod === 'personal_phone' && user.internalContactPhone) {
    return initiatePersonalPhoneHandshake({
      orgId: args.orgId,
      userId: args.userId,
      userFullName: user.fullName,
      rawPhone: user.internalContactPhone,
    });
  }
  throw new InternalContactError(400, 'bad_setup', 'Setup state lỗi, vui lòng gọi DELETE để reset rồi setup lại');
}

/**
 * Gửi lại verify code. Rate-limit 1 lần / 1 phút.
 */
export async function resendVerifyCode(args: { orgId: string; userId: string }) {
  const { senderId } = await loadSender(args.orgId);
  const recipient = await prisma.systemNotifyRecipient.findUnique({
    where: { targetUserId_senderZaloAccountId: { targetUserId: args.userId, senderZaloAccountId: senderId } },
  });
  if (!recipient || !recipient.threadIdInSenderView) {
    throw new InternalContactError(404, 'recipient_missing', 'Chưa có recipient — vui lòng init setup trước');
  }
  if (!['pending_user_confirm', 'pending_friend_request'].includes(recipient.status)) {
    throw new InternalContactError(400, 'wrong_state', `Trạng thái không cho gửi lại mã (${recipient.status})`);
  }

  // Cooldown 1 phút từ lastVerifiedAt (proxy của lần gửi gần nhất)
  const lastSent = recipient.lastVerifiedAt;
  if (lastSent && Date.now() - lastSent.getTime() < RESEND_VERIFY_CODE_COOLDOWN_MS) {
    const waitMs = RESEND_VERIFY_CODE_COOLDOWN_MS - (Date.now() - lastSent.getTime());
    throw new InternalContactError(429, 'resend_cooldown', `Vui lòng đợi ${Math.ceil(waitMs / 1000)}s nữa để gửi lại mã`);
  }

  const code = generateVerifyCode();
  await sendVerifyCode({ senderId, threadIdInSenderView: recipient.threadIdInSenderView, code });

  const updated = await prisma.systemNotifyRecipient.update({
    where: { id: recipient.id },
    data: {
      status: 'pending_user_confirm',
      verifyCode: hashCode(code),
      verifyCodeExpiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS),
      verifyAttempts: 0,
      lastVerifiedAt: new Date(),
      error: null,
    },
  });
  return { recipient: updated };
}

/**
 * Reset setup → sale chọn lại method. KHÔNG removeFriend (giữ friendship để re-setup dễ).
 */
export async function resetInternalContact(args: { orgId: string; userId: string }) {
  const { senderId } = await loadSender(args.orgId).catch(() => ({ senderId: null }));

  await prisma.user.update({
    where: { id: args.userId },
    data: {
      internalContactMethod: null,
      internalContactZaloAccountId: null,
      internalContactPhone: null,
      internalContactSetupAt: null,
      internalContactConfirmedAt: null,
    },
  });

  if (senderId) {
    await prisma.systemNotifyRecipient.updateMany({
      where: { targetUserId: args.userId, senderZaloAccountId: senderId },
      data: {
        status: 'invalid',
        error: 'Sale đã reset setup',
        verifyCode: null,
        verifyCodeExpiresAt: null,
        verifyAttempts: 0,
        threadIdInSenderView: null,
        internalContactZaloAccountId: null,
        friendRequestSentAt: null,
        lastVerifiedAt: new Date(),
      },
    });
  }
}

/**
 * Cron cleanup: pending_friend_request > 7 ngày → invalidate. Chạy 3h sáng mỗi ngày.
 */
export async function cleanupStaleInternalContactSetup() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.systemNotifyRecipient.updateMany({
    where: {
      status: { in: ['pending_friend_request', 'pending_user_confirm'] },
      friendRequestSentAt: { lt: sevenDaysAgo },
    },
    data: {
      status: 'invalid',
      error: 'Quá hạn 7 ngày chưa hoàn tất setup, vui lòng làm lại',
      verifyCode: null,
      verifyCodeExpiresAt: null,
    },
  });
  if (result.count > 0) {
    logger.info(`[internal-contact-cleanup] reset ${result.count} stale pending setups`);
  }
  return result.count;
}

export function startInternalContactCleanupCron() {
  // Chạy mỗi 24h, offset 3h sáng VN. Compute next 3am.
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0); // 3am local
    if (next <= now) next.setDate(next.getDate() + 1);
    const delayMs = next.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        await cleanupStaleInternalContactSetup();
      } catch (err) {
        logger.error('[internal-contact-cleanup] cron failed:', err);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  }
  scheduleNext();
  logger.info('[internal-contact-cleanup] cron scheduled (daily 3am)');
}
