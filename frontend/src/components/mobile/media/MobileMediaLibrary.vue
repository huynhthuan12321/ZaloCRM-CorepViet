<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Kho media mobile (F2): lưới ảnh/video/tài liệu + thư mục hiện có + tìm kiếm + tải thêm vô hạn + trình xem + gửi 1/nhiều.
  Dùng ở 2 chỗ: trang /media (đích chọn bằng MediaTargetSheet, `fixed-target=false`) và sheet trong thread (đích cố định, `fixed-target`).
  Gửi dùng lại sendMediaToConversation / sendAlbumToConversation (như MediaTabPanel) với SNAPSHOT đích lúc bấm Gửi.
  Offline: khóa gửi bằng chữ rõ ràng, không xếp hàng. Chỉ ĐỌC kho ở mobile; tải lên / xóa / thùng rác / sửa tag dùng máy tính.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { MediaAssetItem } from '@/api/media';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MediaGrid from './MediaGrid.vue';
import MediaViewer from './MediaViewer.vue';
import { useMobile } from '@/composables/use-mobile';
import { useConfirm } from '@/composables/use-confirm';
import { useToast } from '@/composables/use-toast';
import { useMobileMediaLibrary } from '@/composables/mobile-media/use-mobile-media-library';
import { useMobileMediaSend } from '@/composables/mobile-media/use-mobile-media-send';
import { MEDIA_KIND_TABS, mediaSendLockReason, summarizeSelection, toggleMediaSelection, type MediaTarget } from './media-model';

const props = withDefaults(defineProps<{
  target: MediaTarget | null;
  /** true = đích đã chốt từ thread (không có nút Đổi). */
  fixedTarget?: boolean;
  /** Khóa ngoài (vd khóa của thread: nick xóa, Riêng tư...). Offline tự tính ở đây. */
  externalLock?: string | null;
}>(), { fixedTarget: false, externalLock: null });
const emit = defineEmits<{ changeTarget: []; sent: [payload: { convId: string; sent: number }] }>();

const lib = useMobileMediaLibrary();
const send = useMobileMediaSend();
const { isOnline } = useMobile();
const { confirm } = useConfirm();
const toast = useToast();

const selected = ref<MediaAssetItem[]>([]);
const selectedIds = computed(() => selected.value.map(i => i.id));
const notice = ref('');
const sendError = ref('');
/** Trạng thái gửi KHÔNG tự mất khi vùng chọn bị xóa (vd album báo một phần): hiện ngoài thanh chọn cho tới khi người dùng đóng. */
const sendStatus = ref('');
const viewerOpen = ref(false);
const viewerIndex = ref(0);

const lockReason = computed(() => {
  const base = mediaSendLockReason({ online: isOnline.value, target: props.target, busy: send.sending.value });
  if (base && !isOnline.value) return base;
  return props.externalLock || base;
});

function toggle(item: MediaAssetItem) {
  const r = toggleMediaSelection(selected.value, item);
  selected.value = r.next;
  notice.value = r.rejected ?? '';
  sendError.value = '';
}
function clearSelection() { selected.value = []; notice.value = ''; sendError.value = ''; }
function dismissStatus() { sendStatus.value = ''; }
async function reloadAfterStatus() { sendStatus.value = ''; await lib.reload(); }
function clearFilters() { lib.search.value = ''; lib.applySearchNow(); lib.setFolder(null); }
function openViewer(index: number) { viewerIndex.value = index; viewerOpen.value = true; }
function onViewerIndex(i: number) { viewerIndex.value = i; }

// ConfirmHost có thể còn mở sau khi trang/sheet bị tháo; không bắt đầu gửi từ component đã rời.
let active = true;
async function onSend() {
  if (!active) return;
  // SNAPSHOT trước khi hỏi xác nhận; sau khi xác nhận kiểm tra lại props: nếu đích đổi/khóa trong lúc hộp thoại mở thì HỦY, không gửi ngầm.
  const snapshotTarget = props.target ? { ...props.target } : null;
  const snapshotItems = [...selected.value];
  if (!snapshotTarget || lockReason.value || snapshotItems.length === 0) return;
  const ok = await confirm({
    title: `Gửi cho ${snapshotTarget.customerName}?`,
    message: `${summarizeSelection(snapshotItems)} sẽ được gửi qua nick ${snapshotTarget.nickName}.`,
    confirmText: 'Gửi',
    cancelText: 'Xem lại',
  });
  if (!active) {
    if (ok) toast.warning('Chưa gửi vì bạn đã rời khỏi Kho media.');
    return;
  }
  if (!ok) return;
  if (!isOnline.value) { sendError.value = mediaSendLockReason({ online: false, target: snapshotTarget, busy: false }) ?? ''; return; }
  const current = props.target;
  if (!current || current.convId !== snapshotTarget.convId || props.externalLock) {
    sendError.value = props.externalLock || 'Hội thoại nhận đã thay đổi trong lúc xác nhận nên chưa gửi. Kiểm tra lại rồi bấm Gửi.';
    return;
  }
  if (current.lockReason || current.nickName !== snapshotTarget.nickName) {
    sendError.value = current.lockReason || 'Nick gửi của hội thoại đã thay đổi trong lúc xác nhận nên chưa gửi. Kiểm tra lại rồi bấm Gửi.';
    return;
  }
  sendError.value = '';
  sendStatus.value = '';
  const result = await send.send(snapshotItems, snapshotTarget);
  // Bỏ khỏi vùng chọn NGAY mọi mục đã gửi xong (cả khi lỗi giữa chừng) để thử lại không gửi trùng.
  // resolvedIds = sentIds + cả album mà server chỉ báo "một phần/không rõ số" (không biết ảnh nào đã đi => không cho gửi lại).
  if (result.resolvedIds.length) {
    const done = new Set(result.resolvedIds);
    selected.value = selected.value.filter(i => !done.has(i.id));
  }
  if (result.sent > 0) emit('sent', { convId: snapshotTarget.convId, sent: result.sent });
  if (result.unresolvedIds.length) {
    sendStatus.value = result.error ?? '';
    notice.value = '';
  } else if (result.ok) {
    toast.success(result.sent > 1 ? `Đã gửi ${result.sent} mục cho ${snapshotTarget.customerName}` : `Đã gửi cho ${snapshotTarget.customerName}`);
  } else {
    sendError.value = result.error ?? 'Gửi thất bại. Vui lòng thử lại.';
  }
}

// ── Tải thêm vô hạn: IntersectionObserver trên mốc cuối lưới; nút "Tải thêm" luôn có sẵn làm đường dự phòng. ──
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;
function observe() {
  observer?.disconnect();
  if (typeof IntersectionObserver === 'undefined' || !sentinel.value) return;
  observer = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) void lib.loadMore();
  }, { rootMargin: '240px 0px' });
  observer.observe(sentinel.value);
}
onMounted(observe);
watch(() => lib.state.value, () => { void nextTick(observe); });
// Sau khi tải thêm, mốc có thể vẫn nằm trong vùng nhìn: IO không bắn lại nếu giao nhau không đổi -> quan sát lại để nối tiếp.
watch(() => lib.items.value.length, () => { void nextTick(observe); });
onBeforeUnmount(() => { active = false; observer?.disconnect(); });

defineExpose({ lib, selected, clearSelection });
</script>

<template>
  <section class="m-ml" aria-label="Kho media">
    <div class="m-ml__target" :class="{ 'm-ml__target--none': !target }">
      <template v-if="target">
        <i class="mdi mdi-send-outline" aria-hidden="true" />
        <span class="m-ml__target-text">
          <span class="m-ml__target-label">Gửi tới</span>
          <strong class="m-ml__target-name">{{ target.customerName }}</strong>
          <span class="m-ml__target-nick">Nick {{ target.nickName }}<template v-if="target.ownerName"> · {{ target.ownerName }}</template></span>
        </span>
      </template>
      <span v-else class="m-ml__target-text">Chưa chọn hội thoại nhận. Bạn vẫn xem được kho; chọn khách khi muốn gửi.</span>
      <button v-if="!fixedTarget" type="button" class="m-ml__link" @click="emit('changeTarget')">{{ target ? 'Đổi' : 'Chọn khách' }}</button>
    </div>

    <label class="m-ml__search">
      <i class="mdi mdi-magnify" aria-hidden="true" />
      <input v-model="lib.search.value" type="search" inputmode="search" enterkeyhint="search" placeholder="Tìm theo tên hoặc tag" aria-label="Tìm trong kho" autocomplete="off" @keydown.enter="lib.applySearchNow()" />
    </label>

    <div class="m-ml__tabs" role="tablist" aria-label="Loại tệp">
      <button v-for="t in MEDIA_KIND_TABS" :key="t.kind" type="button" role="tab" class="m-ml__tab" :class="{ 'm-ml__tab--on': lib.kind.value === t.kind }" :aria-selected="lib.kind.value === t.kind" @click="lib.setKind(t.kind)">
        <i class="mdi" :class="t.icon" aria-hidden="true" />{{ t.label }}
      </button>
    </div>

    <div v-if="lib.folders.value.length" class="m-ml__folders" role="group" aria-label="Thư mục">
      <button type="button" class="m-ml__chip" :class="{ 'm-ml__chip--on': !lib.folderId.value }" :aria-pressed="!lib.folderId.value" @click="lib.setFolder(null)">Tất cả</button>
      <button v-for="f in lib.folders.value" :key="f.id" type="button" class="m-ml__chip" :class="{ 'm-ml__chip--on': lib.folderId.value === f.id }" :aria-pressed="lib.folderId.value === f.id" @click="lib.setFolder(f.id)">
        <i v-if="f.visibility === 'private'" class="mdi mdi-lock-outline" aria-hidden="true" />{{ f.name }}
      </button>
    </div>

    <MobileFeedback v-if="lib.state.value === 'loading'" state="loading" title="Đang tải Kho media" />
    <MobileFeedback v-else-if="lib.state.value === 'offline'" state="offline" :description="lib.errorMessage.value" retryable @retry="lib.reload()" />
    <MobileFeedback v-else-if="lib.state.value === 'forbidden'" state="forbidden" :description="lib.errorMessage.value" />
    <MobileFeedback v-else-if="lib.state.value === 'error'" state="error" title="Không tải được Kho media" :description="lib.errorMessage.value" retryable @retry="lib.reload()" />
    <MobileFeedback
      v-else-if="lib.state.value === 'empty'"
      state="empty"
      :title="lib.search.value.trim() || lib.folderId.value ? 'Không có mục phù hợp' : 'Chưa có mục nào trong mục này'"
      :description="lib.search.value.trim() || lib.folderId.value ? 'Thử bỏ từ khóa hoặc chọn thư mục khác.' : 'Tải lên từ máy tính hoặc lưu ảnh từ hội thoại để dùng lại tại đây.'"
      :clearable="!!(lib.search.value.trim() || lib.folderId.value)"
      @clear-filters="clearFilters"
    />
    <template v-else>
      <MediaGrid :items="lib.items.value" :selected-ids="selectedIds" @open="openViewer" @toggle="toggle" />
      <div ref="sentinel" class="m-ml__sentinel" aria-hidden="true" />
      <p v-if="lib.loadingMore.value" class="m-ml__more" role="status">Đang tải thêm…</p>
      <button v-else-if="lib.hasMore.value" type="button" class="m-ml__loadmore" @click="lib.loadMore()">{{ lib.moreError.value ? 'Không tải thêm được, thử lại' : 'Tải thêm' }}</button>
      <p v-else class="m-ml__end">Đã hiện {{ lib.items.value.length }} mục.</p>
    </template>

    <div v-if="sendStatus" class="m-ml__status" role="status" data-testid="send-status">
      <p><i class="mdi mdi-alert-outline" aria-hidden="true" />{{ sendStatus }}</p>
      <div class="m-ml__bar-row">
        <button type="button" class="m-ml__btn" @click="reloadAfterStatus">Tải lại kho</button>
        <button type="button" class="m-ml__btn" @click="dismissStatus">Đã hiểu</button>
      </div>
    </div>

    <p v-if="notice" class="m-ml__notice" role="status">{{ notice }}</p>

    <div v-if="selected.length" class="m-ml__bar" role="region" aria-label="Gửi mục đã chọn">
      <p v-if="sendError" class="m-ml__err" role="alert"><i class="mdi mdi-alert-circle-outline" aria-hidden="true" />{{ sendError }}</p>
      <p v-else-if="lockReason" class="m-ml__lock" role="status"><i class="mdi mdi-lock-outline" aria-hidden="true" />{{ lockReason }}</p>
      <div class="m-ml__bar-row">
        <span class="m-ml__count">Đã chọn {{ summarizeSelection(selected) }}</span>
        <button type="button" class="m-ml__btn" :disabled="send.sending.value" @click="clearSelection">Bỏ chọn</button>
        <button type="button" class="m-ml__btn m-ml__btn--primary" data-action="send" :disabled="!!lockReason || send.sending.value" :aria-disabled="!!lockReason || send.sending.value" @click="onSend">
          {{ send.sending.value ? 'Đang gửi…' : 'Gửi' }}
        </button>
      </div>
    </div>

    <MediaViewer :open="viewerOpen" :items="lib.items.value" :index="viewerIndex" :selected-ids="selectedIds" :notice="notice" @update:index="onViewerIndex" @toggle="toggle" @close="viewerOpen = false" />
  </section>
</template>

<style scoped>
.m-ml { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; color: var(--m-text); font-family: var(--m-font-family); font-size: var(--m-font-body); }
.m-ml__target { display: flex; align-items: center; gap: var(--m-space-3); padding: var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-brand-soft); }
.m-ml__target--none { background: var(--m-surface-inset); color: var(--m-muted); font-size: var(--m-font-meta); }
.m-ml__target > .mdi { flex: none; font-size: 22px; color: var(--m-brand-strong); }
.m-ml__target-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; overflow-wrap: anywhere; }
.m-ml__target-label { font-size: 12px; color: var(--m-muted); }
.m-ml__target-name { font-size: var(--m-font-section); line-height: 1.25; }
.m-ml__target-nick { font-size: var(--m-font-meta); color: var(--m-text); }
.m-ml__link { flex: none; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 0; background: transparent; color: var(--m-brand-strong); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.m-ml__search { display: flex; align-items: center; gap: var(--m-space-2); min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-muted); }
.m-ml__search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; }
.m-ml__search:focus-within { outline: 3px solid var(--m-focus); outline-offset: 1px; }
.m-ml__tabs { display: flex; gap: var(--m-space-1); padding: var(--m-space-1); border-radius: var(--m-radius-md); background: var(--m-surface-inset); }
.m-ml__tab { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: var(--m-touch); padding: 0 var(--m-space-2); border: 0; border-radius: var(--m-radius-sm); background: transparent; color: var(--m-muted); font: inherit; font-size: var(--m-font-meta); font-weight: 600; cursor: pointer; touch-action: manipulation; }
.m-ml__tab--on { background: var(--m-surface); color: var(--m-brand-strong); box-shadow: var(--m-shadow-rest); }
.m-ml__tab:focus-visible, .m-ml__chip:focus-visible, .m-ml__btn:focus-visible, .m-ml__link:focus-visible, .m-ml__loadmore:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.m-ml__folders { display: flex; gap: var(--m-space-2); overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.m-ml__folders::-webkit-scrollbar { display: none; }
.m-ml__chip { flex: none; display: inline-flex; align-items: center; gap: 4px; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: 22px; background: var(--m-surface); color: var(--m-text); font: inherit; font-size: var(--m-font-meta); cursor: pointer; touch-action: manipulation; max-width: 70vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-ml__chip--on { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.m-ml__sentinel { height: 1px; }
.m-ml__more, .m-ml__end { margin: 0; text-align: center; font-size: var(--m-font-meta); color: var(--m-muted); }
.m-ml__loadmore { align-self: center; min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-brand-strong); font: inherit; font-weight: 650; cursor: pointer; }
.m-ml__notice { margin: 0; font-size: var(--m-font-meta); color: var(--m-warning); font-weight: 600; }
.m-ml__status { display: flex; flex-direction: column; gap: var(--m-space-2); padding: var(--m-space-3); border: 1px solid var(--m-warning); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-warning); }
.m-ml__status p { display: flex; gap: var(--m-space-2); align-items: flex-start; margin: 0; font-size: var(--m-font-meta); font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.m-ml__bar { position: sticky; bottom: 0; z-index: 2; display: flex; flex-direction: column; gap: var(--m-space-2); margin: 0 calc(-1 * var(--m-space-1)); padding: var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); box-shadow: var(--m-shadow); }
.m-ml__bar-row { display: flex; align-items: center; gap: var(--m-space-2); }
.m-ml__count { flex: 1; min-width: 0; font-size: var(--m-font-meta); font-weight: 600; overflow-wrap: anywhere; }
.m-ml__btn { flex: none; min-height: 44px; padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.m-ml__btn--primary { border-color: var(--m-brand-strong); background: var(--m-brand-strong); color: var(--m-on-action); }
.m-ml__btn:disabled { opacity: .5; cursor: default; }
.m-ml__err, .m-ml__lock { display: flex; gap: var(--m-space-2); align-items: flex-start; margin: 0; font-size: var(--m-font-meta); font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.m-ml__err { color: var(--m-danger); }
.m-ml__lock { color: var(--m-warning); }
</style>
