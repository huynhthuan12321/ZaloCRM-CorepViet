<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Route adapter chat mobile (CONTRACT-A §3, §4). MỘT instance useChat + MỘT socket cho cả inbox lẫn thread.
  Chiều cao lấy từ khung shell (height:100% của main), KHÔNG calc(100vh - Npx); composer sát đáy, safe-bottom do shell lo.
  Payload gửi tin giữ y desktop (sendMessageTo); thay đổi duy nhất: chụp convId đồng bộ lúc bấm gửi.
-->
<template>
  <div ref="rootRef" class="mobile-chat" :class="{ 'is-thread': threadOpen, 'is-keyboard': keyboardOpen, 'is-short': shortScreen }">
    <p v-if="realtimeOffline" class="mobile-chat__realtime" role="status">
      <i class="mdi mdi-lan-disconnect" aria-hidden="true" /> Mất kết nối realtime, đang thử kết nối lại…
    </p>

    <div class="mobile-chat__stage">
      <MobileInbox
        ref="inboxRef"
        :active="!threadOpen"
        :conversations="conversations"
        :query="searchQuery"
        :filters="uiFilters"
        :can-choose-sale="canChooseSale" :sale-users="saleUsers" :sales-loading="salesLoading"
        :sales-error="salesError" :current-user-name="auth.user?.fullName"
        :state="inboxState"
        :has-more="convHasMore"
        :loading-more="convLoadingMore"
        :accounts="accountOptions"
        :selected-id="routeConvId"
        @update:query="searchQuery = $event"
        @update:filters="applyFilters"
        @select="onSelect"
        @load-more="loadMoreConversations"
        @retry="onRetryInbox"
        @compose="openCompose('')"
      />

      <section v-if="threadOpen" class="mobile-chat__thread" aria-label="Hội thoại">
        <template v-if="threadReady && selectedConv">
          <MobileFeedback
            v-if="selectedConv.channelAccount"
            state="forbidden"
            title="Chưa hỗ trợ trên điện thoại"
            description="Hội thoại của kênh thử nghiệm chỉ xem được trên máy tính."
          />
          <MessageThread
            v-else
            :key="selectedConv.id"
            ref="threadRef"
            class="mobile-chat__messages"
            mobile
            ai-apply-mode="manual"
            :draft="draftText"
            :conversation="selectedConv"
            :messages="messages"
            :loading="loadingMsgs"
            :sending="sendingMsg"
            :show-contact-panel="false"
            ai-suggestion=""
            :ai-suggestion-loading="false"
            ai-suggestion-error=""
            :all-conversations="conversations"
            :replying-to="replyingTo"
            :editing-message="editingMessage"
            :typing-users="currentTypers"
            @update:draft="onDraftUpdate"
            @send="handleSend"
            @ask-ai="openAi"
            @open-attachment-sheet="openAttachment"
            @toggle-contact-panel="openContactProfile"
            @add-reaction="onAddReaction"
            @remove-reaction="onRemoveReaction"
            @delete-message="onDeleteMessage"
            @undo-message="onUndoMessage"
            @edit-message="onEditMessage"
            @forward-message="onForwardMessage"
            @set-reply-to="setReplyTo"
            @set-editing="setEditing"
            @cancel-reply-edit="onCancelReplyEdit"
            @typing="onTyping"
            @refresh-thread="onRefreshThread"
            @switch-conversation="onSwitchToNickConv"
            @profile-synced="patchContactProfile"
          >
            <template #header-leading><ThreadBackButton @back="goBack" /></template>
            <template #header-below><ThreadContextBar :context="threadContext" :compact="keyboardOpen || shortScreen" /></template>
            <template #messages-tail>
              <PendingQueueStrip :items="pendingItems" :online="isOnline" @cancel="onCancelPending" @resend="onResendPending" />
            </template>
          </MessageThread>
        </template>
        <template v-else>
          <div class="mobile-chat__bar">
            <ThreadBackButton @back="goBack" />
            <span class="mobile-chat__bar-title">Hội thoại</span>
          </div>
          <MobileFeedback v-if="threadState === 'loading'" state="loading" title="Đang mở hội thoại…" />
          <MobileFeedback
            v-else
            :state="isOnline ? 'error' : 'offline'"
            :title="isOnline ? 'Không mở được hội thoại' : 'Đang mất kết nối'"
            :description="isOnline ? 'Hội thoại không tồn tại hoặc bạn không có quyền xem.' : 'Kết nối lại rồi thử lại.'"
            retryable
            @retry="reopenThread"
          />
        </template>
      </section>
    </div>

    <AttachmentSheet
      v-if="selectedConv"
      v-model:open="attachOpen"
      :conversation-id="attachConvId"
      :current-conversation-id="routeConvId"
      :customer-name="conversationDisplayName(selectedConv)"
      :context="threadContext"
      :disabled="!!attachLock"
      :disabled-reason="attachLock ?? undefined"
      @pick="onPickFiles"
      @open-library="onOpenLibrary"
      @rejected="onRejectedFiles"
    />
    <MediaLibrarySheet
      v-if="selectedConv"
      v-model:open="libraryOpen"
      :conversation-id="libraryConvId"
      :current-conversation-id="routeConvId"
      :customer-name="conversationDisplayName(selectedConv)"
      :owner-name="threadContext.ownerName"
      :contact="selectedConv.contact"
      :owner-nick-id="selectedConv.zaloAccount?.id ?? null"
      :nick-name="selectedConv.zaloAccount?.displayName ?? null"
      :disabled="!!attachLock"
      :disabled-reason="attachLock ?? undefined"
    />
    <AISuggestionSheet
      v-if="selectedConv"
      v-model:open="aiOpen"
      :conversation-id="aiConvId"
      :suggestion="sheetAi.suggestion"
      :sources="sheetAi.sources"
      :loading="sheetAi.loading"
      :error="sheetAi.error"
      :needs-review-reason="sheetAi.reason"
      :enabled="aiEnabled"
      :remaining="aiUsage.remaining"
      :current-draft="draftText"
      @ask="askAi"
      @apply-draft="onApplyDraft"
    />

    <NewMessageDialog
      v-if="composeOpen"
      v-model="composeOpen"
      :accounts="zaloAccounts"
      :default-account-id="null"
      :initial-query="composeQuery"
      @opened="onComposeOpened"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useInboxSales } from '@/composables/use-inbox-sales';
import { useSaleFilterUrl } from '@/composables/use-sale-filter-url';
import { useRoute, useRouter } from 'vue-router';
import MessageThread from '@/components/chat/MessageThread.vue';
import NewMessageDialog from '@/components/chat/NewMessageDialog.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { MOBILE_SESSION_RESET_EVENT, useMobileShell } from '@/components/mobile/shell/shell-context';
import MobileInbox from '@/components/mobile/chat/MobileInbox.vue';
import ThreadBackButton from '@/components/mobile/chat/ThreadBackButton.vue';
import ThreadContextBar from '@/components/mobile/chat/ThreadContextBar.vue';
import PendingQueueStrip from '@/components/mobile/chat/PendingQueueStrip.vue';
import AttachmentSheet from '@/components/mobile/chat/AttachmentSheet.vue';
import MediaLibrarySheet from '@/components/mobile/chat/MediaLibrarySheet.vue';
import AISuggestionSheet from '@/components/mobile/chat/AISuggestionSheet.vue';
import { buildConversationContext, attachmentLockReason, conversationDisplayName } from '@/components/mobile/chat/conversation-model';
import { describeUploadError } from '@/components/mobile/chat/attachment-config';
import type { InboxFilters, InboxViewState } from '@/components/mobile/chat/types';
import { useChat } from '@/composables/use-chat';
import { createQueueSender } from '@/components/mobile/chat/queue-send';
import { usePrivacyVisibility } from '@/composables/use-privacy-visibility';
import { useChatOperations } from '@/composables/use-chat-operations';
import { uploadChatAttachments } from '@/composables/use-chat-attachments';
import { useMobileBack } from '@/composables/use-mobile-back';
import { useMobile } from '@/composables/use-mobile';
import { useOfflineQueue, canQueueOffline, displayStateOf } from '@/composables/use-offline-queue';
import { useMobileChatDrafts, useDraftUnloadGuard } from '@/composables/mobile/use-mobile-chat-drafts';
import { useMobileInboxFilters, buildInboxQueryParams } from '@/composables/mobile/use-mobile-inbox-filters';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { openContactChat } from '@/composables/use-open-contact-chat';
import { useConfirm } from '@/composables/use-confirm';
import { useToast } from '@/composables/use-toast';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const { confirm } = useConfirm();
const { isOnline } = useMobile();
const shell = useMobileShell();
const keyboardOpen = shell.viewport.keyboardOpen;

// ── MỘT instance useChat + MỘT socket cho cả inbox lẫn thread (C-1, H8) ─────────────────────────────
const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, convHasMore, convLoadingMore, loadingMsgs, sendingMsg, searchQuery, accountFilter, extraFilters,
  aiSuggestion, aiSuggestionError, aiSuggestionSources, aiNeedsReviewReason, aiUsage, aiConfig, convFetchError,
  fetchConversations, loadMoreConversations, fetchMessages, selectConversation, sendMessageTo,
  fetchAiConfig, generateAiSuggestion, patchContactProfile,
  initSocket, destroySocket, getSocket, typingConvIds, realtimeOffline, workScope,
} = useChat();

const {
  typingUsers, replyingTo, editingMessage,
  addReaction, removeReaction, sendTypingEvent, deleteMessage, undoMessage, editMessage, forwardMessage,
  setReplyTo, clearReplyTo, setEditing, clearEditing, registerSocketListeners,
} = useChatOperations();

const { pendingMessages, enqueue, cancel, flush, resend } = useOfflineQueue();
const drafts = useMobileChatDrafts();
useDraftUnloadGuard();
const inboxFilterState = useMobileInboxFilters();
const { users: saleUsers, canChooseSale, loading: salesLoading, error: salesError } = useInboxSales();
const saleSelection = computed({
  get: () => inboxFilterState.filters.assignedUserId ?? null,
  set: value => inboxFilterState.apply({ ...inboxFilterState.filters, assignedUserId: value }),
});
useSaleFilterUrl(saleSelection, canChooseSale, computed(() => auth.user?.id ?? ''), computed(() => auth.user?.orgId ?? ''));
watch(canChooseSale, allowed => {
  inboxFilterState.filters.mine = !allowed;
}, { immediate: true, flush: 'sync' });
// Đợt D (duyệt 09/11): chỉ trạng thái lọc, không có dữ liệu khách trong URL.
// Nạp trước watcher thread immediate để cả deep link nguội gửi request đã lọc ngay từ đầu.
if (route.query.filter === 'unreplied') {
  inboxFilterState.apply({ ...inboxFilterState.filters, unreplied: true });
}
extraFilters.value = buildInboxQueryParams(inboxFilterState.filters, auth.user?.id ?? null);
const { accounts: zaloAccounts, fetchAccounts: fetchZaloAccounts } = useZaloAccounts();

// Trạng thái sheet khai báo sớm vì watcher route (immediate) có thể gọi closeSheets() ngay trong setup.
const uploading = ref(false);
const attachOpen = ref(false);
const attachConvId = ref('');
const libraryOpen = ref(false);
const libraryConvId = ref('');
const aiOpen = ref(false);
const aiConvId = ref('');

// ── Route: /chat (inbox) và /chat/:convId (thread) là cùng một route record (H7) ─────────────────
const routeConvId = computed(() => {
  const id = route.params.convId;
  return typeof id === 'string' && id !== '' ? id : null;
});
const threadOpen = computed(() => routeConvId.value !== null);
const { goBack: goBackInHistory, canGoBackInApp } = useMobileBack({ name: 'Chat' });
// Không mang tham số một lần (conv/contactId/compose/draft) về inbox rồi tự mở lại thread.
function inboxRouteQuery() {
  return {
    ...(route.query.filter === 'unreplied' ? { filter: 'unreplied' } : {}),
    ...(saleSelection.value ? { assignedUserId: saleSelection.value } : {}),
  };
}
async function goBack() {
  if (canGoBackInApp.value) await goBackInHistory();
  else await router.replace({ name: 'Chat', query: inboxRouteQuery() });
}

type ThreadState = 'idle' | 'loading' | 'ready' | 'error';
const threadState = ref<ThreadState>('idle');
let openSeq = 0;

async function openThread(convId: string) {
  const seq = ++openSeq;
  threadState.value = 'loading';
  try {
    await selectConversation(convId);
  } catch {
    // selectConversation đã tự toast/log lỗi mạng; trạng thái lỗi được suy ra bên dưới.
  }
  if (seq !== openSeq) return; // người dùng đã sang hội thoại khác trong lúc chờ
  threadState.value = selectedConv.value?.id === convId ? 'ready' : 'error';
}
function reopenThread() {
  if (routeConvId.value) void openThread(routeConvId.value);
}

watch(
  routeConvId,
  (id, prev) => {
    if (!id && prev) focusRowAfterBack(prev);
    // Hội thoại khác: không mang trả lời/sửa tin dở dang từ khách trước sang khách sau.
    clearReplyTo();
    clearEditing();
    closeSheets();
    clearAiShared(); // trạng thái AI là của MỘT hội thoại: không mang sang khách khác
    if (!id) {
      openSeq += 1;
      threadState.value = 'idle';
      selectedConvId.value = null;
      return;
    }
    void openThread(id);
  },
  { immediate: true }, // deep link cold start: đúng 1 lần selectConversation
);

const threadReady = computed(() => threadState.value === 'ready' && !!selectedConv.value && selectedConv.value.id === routeConvId.value);

function onSelect(convId: string) {
  if (routeConvId.value === convId) return;
  void router.push({ name: 'Chat', params: { convId }, query: inboxRouteQuery() });
}

// Link cũ /chat?conv= | ?conversationId= -> /chat/:convId (giữ parity ChatView desktop).
watch(
  () => [route.query.conv, route.query.conversationId] as const,
  ([conv, conversationId]) => {
    if (routeConvId.value) return;
    const legacyId = typeof conv === 'string' ? conv : (typeof conversationId === 'string' ? conversationId : '');
    if (!legacyId) return;
    const query = { ...route.query };
    delete query.conv;
    delete query.conversationId;
    void router.replace({ name: 'Chat', params: { convId: legacyId }, query });
  },
  { immediate: true },
);
// /chat?contactId= -> hội thoại 1-1 với khách đó.
watch(
  () => route.query.contactId,
  (contactId) => {
    if (typeof contactId === 'string' && contactId) void openContactChat(router, contactId);
  },
  { immediate: true },
);
// /chat?compose=SĐT -> mở "Tin nhắn mới" điền sẵn.
const composeOpen = ref(false);
const composeQuery = ref('');
function openCompose(phone: string) {
  composeQuery.value = phone;
  composeOpen.value = true;
}
watch(
  () => route.query.compose,
  (compose) => {
    if (typeof compose !== 'string' || !compose) return;
    openCompose(compose);
    const query = { ...route.query };
    delete query.compose;
    void router.replace({ name: 'Chat', params: route.params, query });
  },
  { immediate: true },
);
async function onComposeOpened(conversationId: string) {
  composeOpen.value = false;
  await fetchConversations();
  void router.push({ name: 'Chat', params: { convId: conversationId }, query: inboxRouteQuery() });
}
async function onSwitchToNickConv(convId: string) {
  if (!conversations.value.find(c => c.id === convId)) await fetchConversations();
  void router.push({ name: 'Chat', params: { convId }, query: inboxRouteQuery() });
}
function openContactProfile() {
  const contactId = selectedConv.value?.contact?.id;
  if (!contactId) return;
  if (!auth.canAccess('contact')) {
    toast.error('Bạn không có quyền xem hồ sơ khách hàng');
    return;
  }
  void router.push({ name: 'ContactProfile', params: { id: contactId } });
}

// ── Màn thấp (điện thoại xoay ngang): thu gọn header/composer để vùng tin >= ~45% chiều cao ───────────
const rootRef = ref<HTMLElement | null>(null);
const shortScreen = ref(false);
let shortMql: MediaQueryList | null = null;
function syncShortScreen() {
  shortScreen.value = !!shortMql?.matches;
}

// Toast đè composer (QA M-3): đo chiều cao composer thật rồi ghi --m-composer-h lên body để MobileLayout nâng toast lên trên nó.
let composerObserver: ResizeObserver | null = null;
function publishComposerHeight(px: number) {
  document.body.style.setProperty('--m-composer-h', `${Math.max(0, Math.round(px))}px`);
}
function observeComposer() {
  composerObserver?.disconnect();
  composerObserver = null;
  const el = rootRef.value?.querySelector<HTMLElement>('.input-area') ?? null;
  if (!el || typeof ResizeObserver === 'undefined') {
    publishComposerHeight(0);
    return;
  }
  publishComposerHeight(el.getBoundingClientRect().height);
  composerObserver = new ResizeObserver(() => publishComposerHeight(el.getBoundingClientRect().height));
  composerObserver.observe(el);
}

// ── Chrome: thread ẩn header + tabbar (§4.1). Composer nhận safe-bottom từ main của shell khi tabbar ẩn & bàn phím đóng ──
let releaseChrome: (() => void) | null = null;
watch(
  threadOpen,
  (open) => {
    releaseChrome?.();
    releaseChrome = open ? shell.requestChrome({ tabbar: false, header: false }) : null;
  },
  { immediate: true },
);

// ── Inbox ───────────────────────────────────────────────────────────────────────────────────────
const inboxState = computed<InboxViewState>(() => {
  if (loadingConvs.value && conversations.value.length === 0) return 'loading';
  if (!isOnline.value && conversations.value.length === 0) return 'offline';
  if (convFetchError.value && conversations.value.length === 0) return 'error';
  return 'ready';
});
// accountId là phản chiếu của workScope (nguồn chân lý nick), phần còn lại là state module trong RAM.
const uiFilters = computed<InboxFilters>(() => ({
  unread: inboxFilterState.filters.unread,
  unreplied: inboxFilterState.filters.unreplied,
  mine: inboxFilterState.filters.mine,
  assignedUserId: inboxFilterState.filters.assignedUserId,
  accountId: accountFilter.value,
}));
const accountOptions = computed(() => (zaloAccounts.value ?? []).map(a => ({ id: a.id, displayName: a.displayName?.trim() || 'Nick Zalo' })));

function applyFilters(next: InboxFilters) {
  if (!canChooseSale.value) next = { ...next, assignedUserId: auth.user?.id ?? null, mine: true };
  else if (next.mine) next = { ...next, assignedUserId: auth.user?.id ?? null };
  inboxFilterState.apply(next);
  extraFilters.value = buildInboxQueryParams(next, auth.user?.id ?? null);
  if (accountFilter.value !== next.accountId) accountFilter.value = next.accountId;
  const query = { ...route.query };
  if (next.unreplied) query.filter = 'unreplied';
  else if (query.filter === 'unreplied') delete query.filter;
  if (next.assignedUserId) query.assignedUserId = next.assignedUserId;
  else delete query.assignedUserId;
  if (query.filter !== route.query.filter || query.assignedUserId !== route.query.assignedUserId) {
    void router.replace({ name: 'Chat', params: route.params, query });
  }
  void fetchConversations();
}
// URL có thể đổi khi màn inbox vẫn đang mount (đi từ Tổng quan hoặc browser back).
// Không xóa RAM filters khi URL thiếu filter: back vẫn giữ lựa chọn đang có.
watch(() => route.query.filter, filter => {
  if (filter !== 'unreplied' || inboxFilterState.filters.unreplied) return;
  inboxFilterState.apply({ ...inboxFilterState.filters, unreplied: true });
  extraFilters.value = buildInboxQueryParams(inboxFilterState.filters, auth.user?.id ?? null);
  void fetchConversations();
});
watch(saleSelection, () => {
  extraFilters.value = buildInboxQueryParams(inboxFilterState.filters, auth.user?.id ?? null);
  void fetchConversations();
});
function onRetryInbox() {
  void fetchConversations({ bypassCache: true });
}

// Back từ thread: trả focus về đúng hàng vừa mở (không cuộn, để giữ vị trí inbox).
const inboxRef = ref<{ focusRow: (convId: string) => void } | null>(null);
function focusRowAfterBack(convId: string) {
  void nextTick(() => inboxRef.value?.focusRow(convId));
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchQuery, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void fetchConversations(), 300);
});

// ── Thread: reaction / xóa / thu hồi / sửa / chuyển tiếp / gõ (parity ChatView; convId đọc lúc xảy ra sự kiện) ──
const currentTypers = computed(() => {
  const myId = auth.user?.id;
  const convId = selectedConvId.value;
  const internalAll = (convId ? typingUsers.value.get(convId) : null) || [];
  const internal = myId ? internalAll.filter(u => u.userId !== myId) : internalAll;
  if (!convId || !typingConvIds.value.has(convId)) return internal;
  const conv = selectedConv.value;
  const customerName = conv?.contact?.fullName || (conv?.threadType === 'group' ? 'Thành viên' : 'Khách hàng');
  return [{ userId: '__customer__', userName: customerName }, ...internal];
});

async function onAddReaction(msgId: string, reaction: string) {
  if (selectedConvId.value) await addReaction(selectedConvId.value, msgId, reaction);
}
async function onRemoveReaction(msgId: string, reaction: string) {
  if (selectedConvId.value) await removeReaction(selectedConvId.value, msgId, reaction);
}
async function onDeleteMessage(msgId: string) {
  if (selectedConvId.value) await deleteMessage(selectedConvId.value, msgId);
}
async function onUndoMessage(msgId: string) {
  const convId = selectedConvId.value;
  if (!convId) return;
  try {
    await undoMessage(convId, msgId);
    toast.success('Đã thu hồi tin nhắn');
    await fetchMessages(convId);
  } catch (err) {
    toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không thu hồi được tin');
  }
}
async function onEditMessage(msgId: string, content: string) {
  const convId = selectedConvId.value;
  if (!convId) return;
  try {
    await editMessage(convId, msgId, content);
    toast.warning('Đã sửa trên CRM — KH ở Zalo vẫn thấy bản gốc');
    clearEditing();
    await fetchMessages(convId);
  } catch (err) {
    toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không sửa được tin');
  }
}
async function onForwardMessage(msgId: string, targetIds: string[]) {
  const convId = selectedConvId.value;
  if (!convId) return;
  try {
    await forwardMessage(convId, msgId, targetIds);
    toast.success(`Đã chuyển tiếp tới ${targetIds.length} hội thoại`);
  } catch (err) {
    toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không chuyển tiếp được');
  }
}
function onCancelReplyEdit() {
  clearReplyTo();
  clearEditing();
}
function onTyping() {
  if (selectedConvId.value) sendTypingEvent(selectedConvId.value);
}
function onRefreshThread() {
  if (selectedConvId.value) void fetchMessages(selectedConvId.value);
}

// ── Nháp theo hội thoại, chỉ RAM (D-7, H11) ────────────────────────────────────────────────────
const draftText = computed(() => (routeConvId.value ? drafts.get(routeConvId.value) : ''));
function onDraftUpdate(text: string, convId: string | null) {
  // Chỉ ghi cho đúng hội thoại mà MessageThread báo; sự kiện muộn của khách cũ bị bỏ.
  if (!convId || convId !== routeConvId.value) return;
  drafts.set(convId, text);
}
/** Khôi phục nháp sau khi MessageThread đã tự xóa ô soạn (nó xóa ngay sau emit send, đồng bộ). */
async function restoreDraft(convId: string, text: string) {
  // Đợi 1 macrotask: MessageThread còn phải flush watcher (phát update:draft '') sau khi xóa ô soạn; ghi sớm hơn sẽ bị đè.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  if (drafts.get(convId) === '') drafts.set(convId, text);
}

// ── Gửi tin: chụp convId ĐỒNG BỘ lúc bấm; payload y desktop (sendMessageTo) ─────────────────────
async function handleSend(
  content: string,
  replyMessageId?: string | null,
  styles?: Array<{ st: string; start: number; len: number }>,
  mentions?: Array<{ uid: string; pos: number; len: number }>,
) {
  const convId = selectedConvId.value; // chụp đồng bộ, TRƯỚC mọi await
  if (!convId || !content.trim()) return;
  const conv = selectedConv.value?.id === convId ? selectedConv.value : null;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Rào 2 (§3.5): offline chỉ xếp hàng tin văn bản thuần của hội thoại Zalo.
    if (!conv || conv.channelAccount) {
      toast.error('Đang mất kết nối nên chưa gửi được tin này.');
      void restoreDraft(convId, content);
      return;
    }
    if (!canQueueOffline({ replyMessageId, styles, mentions })) {
      toast.warning('Đang mất kết nối: chỉ xếp hàng chờ được tin văn bản thuần. Tin có trả lời, định dạng hoặc @nhắc chưa được gửi, nội dung đã giữ lại trong ô soạn.');
      void restoreDraft(convId, content);
      return;
    }
    const item = enqueue(convId, content);
    if (!item) {
      toast.error('Không xác định được tài khoản đăng nhập nên chưa xếp hàng được tin. Nội dung đã giữ lại trong ô soạn.');
      void restoreDraft(convId, content);
      return;
    }
    toast.push('Mất kết nối: tin sẽ tự gửi khi có mạng.');
    void nextTick(() => threadRef.value?.scrollToBottom());
    return;
  }

  try {
    await sendMessageTo(convId, content, replyMessageId, styles, mentions);
  } catch {
    // sendMessageTo đã toast lỗi. Giữ lại nội dung để người dùng bấm gửi lại, không âm thầm mất tin.
    void restoreDraft(convId, content);
  }
}

// ── Hàng đợi offline: UI + tự gửi khi có mạng (rào 5) ──────────────────────────────────────────
const nowTick = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | undefined;
const pendingItems = computed(() => pendingMessages.value
  .filter(m => m.conversationId === routeConvId.value)
  .map(m => ({ id: m.id, content: m.content, state: displayStateOf(m, nowTick.value), maybeDelivered: m.maybeDelivered === true })));

// Hội thoại kênh (channelAccount) không bao giờ được coi là "đã gửi" từ hàng đợi: sender ném lỗi -> mục 'failed'.
const sendFromQueue = createQueueSender({
  findConversation: id => conversations.value.find(c => c.id === id) ?? (selectedConv.value?.id === id ? selectedConv.value : null),
  send: (conversationId, content) => sendMessageTo(conversationId, content),
});
function onCancelPending(id: string) {
  cancel(id);
}
async function onResendPending(id: string) {
  if (!isOnline.value) return;
  const item = pendingMessages.value.find(m => m.id === id);
  if (item?.maybeDelivered) {
    // Trang từng tắt giữa lúc gửi: khách có thể đã nhận. Người dùng phải tự xem lại hội thoại rồi mới quyết.
    const ok = await confirm({
      title: 'Tin này có thể đã gửi rồi',
      message: 'Lần gửi trước bị gián đoạn nên chưa rõ khách đã nhận chưa. Hãy xem lại hội thoại trước. Vẫn gửi lại có thể làm khách nhận tin hai lần.',
      confirmText: 'Vẫn gửi lại',
      cancelText: 'Để xem lại',
    });
    if (!ok) return;
  }
  await resend(id, sendFromQueue);
}
function onOnline() {
  void flush(sendFromQueue);
}

// ── Đính kèm: sheet + Kho media (rào 6: không xếp hàng offline, khóa khi offline) ─────────────────
const threadRef = ref<{ scrollToBottom: () => void } | null>(null);
const threadContext = computed(() => buildConversationContext(selectedConv.value ?? ({} as never)));
const privacy = usePrivacyVisibility();
const attachLock = computed(() => (selectedConv.value
  ? attachmentLockReason({
    online: isOnline.value,
    ctx: threadContext.value,
    sending: sendingMsg.value || uploading.value,
    privacyLocked: !privacy.canSendInConv(selectedConv.value),
  })
  : null));

function openAttachment() {
  if (!routeConvId.value) return;
  attachConvId.value = routeConvId.value; // snapshot lúc mở sheet
  attachOpen.value = true;
}
function onOpenLibrary(convId: string) {
  attachOpen.value = false;
  libraryConvId.value = convId;
  libraryOpen.value = true;
}
function onRejectedFiles(reasons: string[]) {
  toast.error(reasons.slice(0, 3).join(' '));
}
async function onPickFiles(payload: { files: File[]; conversationId: string }) {
  const { files, conversationId } = payload;
  if (conversationId !== selectedConvId.value) {
    toast.warning('Đã đổi khách, chưa gửi tệp.');
    attachOpen.value = false;
    return;
  }
  if (attachLock.value) {
    toast.error(attachLock.value);
    return;
  }
  attachOpen.value = false;
  uploading.value = true;
  toast.push(`Đang gửi ${files.length} tệp…`);
  try {
    await uploadChatAttachments(conversationId, files);
    toast.success(`Đã gửi ${files.length} tệp`);
    // fetchMessages đổi cả hội thoại hiển thị -> chỉ làm khi vẫn đang ở đúng khách.
    if (selectedConvId.value === conversationId) await fetchMessages(conversationId);
  } catch (err) {
    toast.error(describeUploadError(err));
  } finally {
    uploading.value = false;
  }
}

// ── AI: chỉ "Áp vào nháp", không tự gửi, không tự điền khi gợi ý về ────────────────────────────
// Trạng thái AI của useChat là MỘT bộ ref dùng chung. Để chữ của khách A không bao giờ hiện ở sheet của khách B:
//  - askAi chụp convId lúc bấm, chạy tuần tự (không có hai request chồng nhau), bỏ qua nếu đã sang khách khác trước khi bắt đầu;
//  - sau await, nếu selectedConvId đã đổi -> xóa sạch ref AI;
//  - sheet chỉ nhận dữ liệu khi không có request của khách KHÁC đang chạy (đóng cửa sổ giữa lúc ghi ref và lúc xóa).
const aiEnabled = computed(() => aiConfig.value.enabled && aiUsage.value.remaining > 0);
const aiInflightConv = ref<string | null>(null); // khách của request đang chạy bên trong generateAiSuggestion
const aiWaitingConv = ref<string | null>(null); // khách của lần bấm gần nhất còn chờ kết quả (trạng thái loading)
let aiChain: Promise<void> = Promise.resolve();

function clearAiShared() {
  aiSuggestion.value = '';
  aiSuggestionSources.value = [];
  aiNeedsReviewReason.value = '';
  aiSuggestionError.value = '';
}
function askAi() {
  const convId = routeConvId.value; // chụp ĐỒNG BỘ lúc bấm
  if (!convId || aiWaitingConv.value === convId) return;
  aiWaitingConv.value = convId;
  const run = async () => {
    if (selectedConvId.value !== convId) { // người dùng đã rời khách này trước khi tới lượt
      if (aiWaitingConv.value === convId) aiWaitingConv.value = null;
      return;
    }
    aiInflightConv.value = convId;
    try {
      await generateAiSuggestion();
    } finally {
      aiInflightConv.value = null;
      if (selectedConvId.value !== convId) clearAiShared(); // kết quả muộn của khách cũ: bỏ
      if (aiWaitingConv.value === convId) aiWaitingConv.value = null;
    }
  };
  aiChain = aiChain.then(run, run);
}
const sheetAi = computed(() => {
  const trusted = aiInflightConv.value === null || aiInflightConv.value === routeConvId.value;
  const waiting = aiWaitingConv.value !== null && aiWaitingConv.value === routeConvId.value;
  const show = trusted && !waiting;
  return {
    loading: waiting,
    suggestion: show ? aiSuggestion.value : '',
    sources: show ? aiSuggestionSources.value : [],
    error: show ? aiSuggestionError.value : '',
    reason: trusted ? aiNeedsReviewReason.value : '',
  };
});
function openAi() {
  if (!routeConvId.value) return;
  aiConvId.value = routeConvId.value;
  aiOpen.value = true;
  if (!sheetAi.value.suggestion && !sheetAi.value.loading && aiEnabled.value) askAi();
}
async function onApplyDraft(payload: { conversationId: string; text: string; mode: 'replace' | 'append' }) {
  const { conversationId, text, mode } = payload;
  if (conversationId !== selectedConvId.value) {
    toast.warning('Đã đổi khách, chưa áp gợi ý vào nháp.');
    aiOpen.value = false;
    return;
  }
  const current = drafts.get(conversationId);
  if (mode === 'replace' && current.trim() !== '') {
    // Đóng sheet TRƯỚC khi hỏi: hộp xác nhận toàn cục nằm dưới lớp sheet nên nếu để mở sẽ không bấm được (QA H-1).
    aiOpen.value = false;
    const ok = await confirm({
      title: 'Thay nháp hiện tại?',
      message: 'Nháp đang soạn sẽ được thay bằng gợi ý của AI. Gợi ý chưa được gửi cho khách.',
      confirmText: 'Thay nháp',
      cancelText: 'Giữ nháp',
    });
    if (conversationId !== selectedConvId.value) {
      toast.warning('Đã đổi khách, chưa áp gợi ý vào nháp.');
      return;
    }
    if (!ok) {
      aiOpen.value = true; // giữ nháp: trả người dùng về sheet để chọn tiếp
      return;
    }
  }
  drafts.set(conversationId, mode === 'append' && current.trim() !== '' ? `${current.replace(/\s+$/, '')}\n${text}` : text);
  aiOpen.value = false;
}

function closeSheets() {
  attachOpen.value = false;
  libraryOpen.value = false;
  aiOpen.value = false;
}
watch([threadReady, () => selectedConv.value?.id, threadOpen], () => { void nextTick(observeComposer); }, { flush: 'post' });

// Logout / đổi user: dọn trạng thái dở dang (nháp & bộ lọc tự dọn trong composable của chúng).
function onSessionReset() {
  closeSheets();
  clearAiShared();
  clearReplyTo();
  clearEditing();
}

onMounted(() => {
  extraFilters.value = buildInboxQueryParams(uiFilters.value, auth.user?.id ?? null);
  void fetchZaloAccounts().then(() => {
    // Giống desktop: bỏ phạm vi nick đã lưu mà người dùng không còn quyền.
    workScope.validateAgainst((zaloAccounts.value ?? []).map(a => a.id));
  });
  void fetchConversations();
  void fetchAiConfig();
  initSocket();
  registerSocketListeners(getSocket());
  window.addEventListener('online', onOnline);
  window.addEventListener(MOBILE_SESSION_RESET_EVENT, onSessionReset);
  if (typeof window.matchMedia === 'function') {
    shortMql = window.matchMedia('(max-height: 500px) and (orientation: landscape)');
    syncShortScreen();
    shortMql.addEventListener?.('change', syncShortScreen);
  }
  nowTimer = setInterval(() => { nowTick.value = Date.now(); }, 60_000);
  // Trang vừa mở lại khi đã có mạng: gửi nốt các tin chờ còn hợp lệ.
  if (typeof navigator === 'undefined' || navigator.onLine !== false) void flush(sendFromQueue);
});

onBeforeUnmount(() => {
  destroySocket();
  window.removeEventListener('online', onOnline);
  window.removeEventListener(MOBILE_SESSION_RESET_EVENT, onSessionReset);
  clearTimeout(searchTimer);
  if (nowTimer) clearInterval(nowTimer);
  shortMql?.removeEventListener?.('change', syncShortScreen);
  composerObserver?.disconnect();
  composerObserver = null;
  document.body.style.removeProperty('--m-composer-h');
  releaseChrome?.();
  releaseChrome = null;
});
</script>

<style scoped>
.mobile-chat {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--m-bg);
  color: var(--m-text);
  font-family: var(--m-font-family);
  /* MessageThread dùng token --smax-*: ánh xạ sang --m-* để Sáng/Tối phủ cả thread, composer. */
  --smax-bg: var(--m-surface);
  --smax-grey-50: var(--m-surface-inset);
  --smax-grey-100: var(--m-bg);
  --smax-grey-200: var(--m-line);
  --smax-grey-300: var(--m-line);
  --smax-grey-500: var(--m-muted);
  --smax-grey-600: var(--m-muted);
  --smax-grey-700: var(--m-muted);
  --smax-text: var(--m-text);
  --smax-primary: var(--m-brand-strong);
  --smax-primary-hover: var(--m-brand);
  --smax-primary-soft: var(--m-brand-soft);
  --smax-bubble-self: var(--m-bubble-out);
}
.mobile-chat__realtime {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  margin: 0;
  padding: var(--m-space-2) var(--m-gutter);
  background: var(--m-warning-soft);
  color: var(--m-warning);
  font-size: var(--m-font-meta);
  font-weight: 650;
}
.mobile-chat__stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
.mobile-chat__thread {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--m-bg);
}
.mobile-chat__messages {
  flex: 1;
  min-height: 0;
  height: auto;
}
.mobile-chat__bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  min-height: var(--m-header);
  padding: 0 var(--m-gutter);
  background: var(--m-surface);
  border-bottom: 1px solid var(--m-line);
}
.mobile-chat__bar-title {
  font-size: var(--m-font-section);
  font-weight: 650;
}

/* ── Giao diện mobile cho MessageThread (chỉ CSS, logic nằm trong MessageThread qua prop `mobile`) ── */
.mobile-chat :deep(.message-thread.is-mobile) {
  background: var(--m-bg);
}
/* Header gọn cho màn hẹp: hàng 1 = [quay lại][avatar][TÊN][⋮]; các chip (giai đoạn, nhãn, nick, cùng chăm, AI, kết bạn) tự xuống hàng 2+.
   Dùng display:contents để các phần tử con của header xếp chung một flex-wrap mà không sửa markup của MessageThread. */
.mobile-chat :deep(.is-mobile .chat-header) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 6px 8px 6px 4px;
}
.mobile-chat :deep(.is-mobile .chat-header::after) {
  content: '';
  order: 4;
  flex: 0 0 100%;
  height: 0;
}
.mobile-chat :deep(.is-mobile .ch-info),
.mobile-chat :deep(.is-mobile .ch-row-1),
.mobile-chat :deep(.is-mobile .ch-row-chips),
.mobile-chat :deep(.is-mobile .chat-header > .ch-actions) {
  display: contents;
}
.mobile-chat :deep(.is-mobile .chat-header :is(.ch-row-1, .ch-row-chips, .ch-actions) > *) {
  order: 5;
  flex: 0 1 auto;
  min-width: 0;
}
.mobile-chat :deep(.is-mobile .chat-header > .m-thread-back) {
  order: 0;
}
.mobile-chat :deep(.is-mobile .chat-header > .ch-avatar-wrap) {
  order: 1;
  flex: none;
  align-self: center;
}
.mobile-chat :deep(.is-mobile .chat-header .ch-name) {
  order: 2;
  flex: 1 1 0;
  min-width: 0;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-chat :deep(.is-mobile .chat-header .ch-actions > .icon-btn) {
  order: 3;
  flex: none;
}
/* Vùng chạm >= 44px cho các nút trong header (kết bạn, ⋮, đổi nick, công tắc AI). */
.mobile-chat :deep(.is-mobile .chat-header .btn-action),
.mobile-chat :deep(.is-mobile .chat-header .icon-btn),
.mobile-chat :deep(.is-mobile .chat-header .nick-switcher),
.mobile-chat :deep(.is-mobile .chat-header .ai-auto-toggle),
.mobile-chat :deep(.is-mobile .chat-header .zlbl-trigger) {
  min-height: 44px;
  min-width: 44px;
}
.mobile-chat :deep(.is-mobile .ch-gender-chip),
.mobile-chat :deep(.is-mobile .msg-counts),
.mobile-chat :deep(.is-mobile .ch-row-chips .ch-sep),
.mobile-chat :deep(.is-mobile .nick-avatar-halo) {
  display: none;
}
/* Bàn phím mở / màn ngang thấp: chỉ giữ hàng 1 của header để nhường chiều cao cho tin nhắn
   (dòng "Nick X · PT Y" của ThreadContextBar vẫn còn, dạng rút gọn). */
.mobile-chat:is(.is-keyboard, .is-short) :deep(.is-mobile .chat-header :is(.ch-row-1, .ch-row-chips, .ch-actions) > *:not(.ch-name):not(.icon-btn)) {
  display: none;
}
.mobile-chat.is-short :deep(.is-mobile .chat-header) {
  padding-block: 2px;
}
.mobile-chat.is-short :deep(.is-mobile .chat-header .ch-avatar-wrap) {
  display: none;
}
.mobile-chat.is-short :deep(.is-mobile .messages) {
  padding-block: 6px;
}
.mobile-chat.is-short :deep(.is-mobile .input-area) {
  padding-block: 2px;
}
.mobile-chat.is-short :deep(.is-mobile .input-toolbar-top) {
  margin-bottom: 0;
  padding-bottom: 0;
}
.mobile-chat :deep(.is-mobile .messages) {
  padding: 10px 12px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.mobile-chat :deep(.is-mobile .input-area) {
  max-height: 55%;
  padding: 6px 8px;
  /* safe-bottom đã do main của shell cộng (thread ẩn tabbar, bàn phím đóng); KHÔNG cộng thêm ở đây. */
}
.mobile-chat :deep(.is-mobile .input-toolbar-top) {
  flex-wrap: nowrap;
  overflow-x: auto;
  margin-bottom: 4px;
  padding: 0 0 4px;
}
/* Chỉ nút icon của thanh công cụ (không phủ mọi <button> con, vd nút trong popover chèn vào toolbar). */
.mobile-chat :deep(.is-mobile .icon-tool),
.mobile-chat :deep(.is-mobile .input-toolbar-top > button.icon-tool) {
  flex: none;
  width: 44px;
  height: 44px;
  min-width: 44px;
}
.mobile-chat :deep(.is-mobile .attach-plus-btn) {
  order: -2;
  color: var(--m-brand-strong);
}
/* AI luôn nằm ngay sau nút + để không bị cuộn khuất trên màn 320px. */
.mobile-chat :deep(.is-mobile .input-toolbar-top .ai-btn) {
  order: -1;
}
.mobile-chat :deep(.is-mobile .send-btn) {
  width: 44px;
  height: 44px;
  margin-bottom: 0;
}
.mobile-chat :deep(.is-mobile .emoji-trigger) {
  width: 44px;
  height: 44px;
}
/* Ô nhập >= 16px để iOS không tự zoom khi focus. */
.mobile-chat :deep(.is-mobile .input-editor .tiptap-input),
.mobile-chat :deep(.is-mobile .input-editor .tiptap-input p) {
  font-size: 16px;
}
.mobile-chat :deep(.is-mobile .input-editor .tiptap-input) {
  min-height: 44px;
}
/* Placeholder 1 dòng + ellipsis (không bị cắt dòng 2), đủ tương phản (QA L-1). */
.mobile-chat :deep(.is-mobile .input-editor .tiptap-input p.is-editor-empty:first-child::before) {
  float: none;
  display: block;
  height: auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-muted);
}

/* ── Sáng/Tối cho các lớp của MessageThread dùng màu cứng (#fff...): ánh xạ về token --m-* (cùng giá trị ở Sáng) ── */
.mobile-chat :deep(.is-mobile :is(.nick-dd-panel, .zlbl-dropdown.zalo-native, .ctx-menu, .drop-card)) {
  background: var(--m-surface);
  color: var(--m-text);
  border-color: var(--m-line);
}
.mobile-chat :deep(.is-mobile .editor-lock-pill) {
  background: var(--m-surface);
  color: var(--m-warning);
}
.mobile-chat :deep(.is-mobile .album-actionbar .ab-btn:not(.primary)) {
  background: var(--m-surface);
  color: var(--m-text);
  border-color: var(--m-line);
}
</style>

<!-- CSS hộp xác nhận dùng chung nằm trong mobile-tokens.css để có hiệu lực cả khi tải lạnh Cài đặt. -->
<style>
/* Tối: các khung teleport ra ngoài .mobile-chat (v-menu nick/sticker, hộp xác nhận) dùng màu cứng của desktop -> ánh xạ về token --m-*
   (token được cấp cho .v-overlay-container và .cam-overlay trong mobile-tokens.css). Ở Sáng giá trị tương đương, không đổi nhận diện. */
body.m-toast-host .v-overlay-container :is(.nick-dd-panel, .zlbl-dropdown.zalo-native, .sticker-picker) {
  background: var(--m-surface);
  color: var(--m-text);
  border: 1px solid var(--m-line);
}
/* Cùng ánh xạ --smax-* như .mobile-chat để chữ/hover trong menu teleport đúng màu. */
body.m-toast-host .v-overlay-container {
  --smax-bg: var(--m-surface);
  --smax-grey-50: var(--m-surface-inset);
  --smax-grey-100: var(--m-surface-inset);
  --smax-grey-200: var(--m-line);
  --smax-grey-300: var(--m-line);
  --smax-grey-500: var(--m-muted);
  --smax-grey-600: var(--m-muted);
  --smax-grey-700: var(--m-muted);
  --smax-text: var(--m-text);
  --smax-primary: var(--m-brand-strong);
}
body.m-toast-host .v-overlay-container .sticker-picker :is(.sp-search, .sp-item) {
  background: var(--m-surface-inset);
  border-color: var(--m-line);
  color: var(--m-text);
}
body.m-toast-host .v-overlay-container .sticker-picker .sp-chip:not(.active) {
  background: var(--m-surface-inset);
  color: var(--m-text);
}
body.m-toast-host .v-overlay-container .sticker-picker :is(.sp-empty, .sp-loading, .sp-clear) {
  color: var(--m-muted);
}
</style>
