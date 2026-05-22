/**
 * use-privacy-visibility — helper client-side để decide blur cho UI khi
 * server không kịp redact (vd realtime socket message arrive trước context).
 *
 * Anh chốt 2026-05-22:
 *   - Nick privacyMode='main' + viewer KHÔNG phải owner + chưa unlock PIN → blur 75%
 *   - Áp dụng MỌI giao diện hiển thị tin của nick: ConversationList (cột 2),
 *     MessageThread (cột 3), Search results, Contact detail, etc.
 *
 * Composable trả 2 helper:
 *   - shouldBlurConv(conv) → boolean (dựa privacyMode + ownerUserId + currentUser)
 *   - canSendInConv(conv)  → boolean (composer disable nếu false)
 */
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePrivacyStore } from '@/stores/privacy';

interface ConvLike {
  zaloAccount?: {
    privacyMode?: string;
    ownerUserId?: string | null;
  } | null;
  redacted?: boolean;
}

export function usePrivacyVisibility() {
  const auth = useAuthStore();
  const privacyStore = usePrivacyStore();

  const currentUserId = computed(() => auth.user?.id ?? null);
  const isUnlocked = computed(() => privacyStore.isUnlocked);

  /**
   * True nếu conv phải bị blur vì privacy mode + viewer không có quyền xem.
   * Logic:
   *   - server đã trả conv.redacted=true → respect
   *   - hoặc client-side check: privacyMode='main' && ownerUserId !== currentUser && !unlocked
   */
  function shouldBlurConv(conv: ConvLike | null | undefined): boolean {
    if (!conv) return false;
    if (conv.redacted === true) return true;
    const acc = conv.zaloAccount;
    if (!acc) return false;
    if (acc.privacyMode !== 'main') return false;
    // Owner + unlocked → see full
    if (acc.ownerUserId === currentUserId.value && isUnlocked.value) return false;
    // Owner but locked → still blur (anh chốt: ai cũng phải unlock kể cả owner)
    if (acc.ownerUserId === currentUserId.value) return true;
    // Non-owner → always blur on main nick
    return true;
  }

  /**
   * True nếu user hiện tại được gửi tin nhắn trong conv này.
   * Chặn UI input khi privacy='main' và không phải chính chủ.
   * (Bot/automation không qua UI nên không bị block.)
   */
  function canSendInConv(conv: ConvLike | null | undefined): boolean {
    if (!conv) return false;
    const acc = conv.zaloAccount;
    if (!acc) return true;
    if (acc.privacyMode !== 'main') return true;
    return acc.ownerUserId === currentUserId.value;
  }

  /**
   * True nếu message bị redact (server đã trả) hoặc thuộc conv bị blur.
   * Dùng cho từng bubble trong MessageThread.
   */
  function shouldBlurMessage(msg: { redacted?: boolean } | null | undefined, conv: ConvLike | null | undefined): boolean {
    if (!msg) return false;
    if (msg.redacted === true) return true;
    return shouldBlurConv(conv);
  }

  return { shouldBlurConv, canSendInConv, shouldBlurMessage };
}
