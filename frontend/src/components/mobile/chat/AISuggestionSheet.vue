<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Gợi ý AI trên mobile (CONTRACT-A §3.2, H6/H13). CHỈ có "Áp vào nháp" - KHÔNG có đường gửi.
  Đóng sheet không xóa nháp. Presenter thuần: không gọi API; cha xử lý ask/applyDraft (và hỏi xác nhận khi thay nháp).
-->
<template>
  <MobileSheet :open="open" title="Gợi ý trả lời từ AI" @update:open="emit('update:open', $event)">
    <p v-if="!enabled" class="m-ai__note" role="status">
      AI đang tắt hoặc đã hết lượt hôm nay{{ remaining === 0 ? ' (còn 0 lượt)' : '' }}. Bạn vẫn có thể tự soạn tin.
    </p>

    <p v-if="needsReviewReason" class="m-ai__review" role="alert">
      <i class="mdi mdi-alert-outline" aria-hidden="true" />
      <span>Cần bạn duyệt kỹ trước khi gửi: {{ needsReviewReason }}</span>
    </p>

    <div v-if="loading" class="m-ai__loading" role="status" aria-live="polite">
      <i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> Đang soạn gợi ý…
    </div>
    <div v-else-if="error" class="m-ai__error" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="m-ai__btn" :disabled="!enabled" @click="emit('ask')">Thử lại</button>
    </div>
    <template v-else-if="suggestion">
      <p class="m-ai__label" id="m-ai-suggestion-label">Gợi ý (chưa gửi cho khách)</p>
      <blockquote class="m-ai__text" aria-labelledby="m-ai-suggestion-label">{{ suggestion }}</blockquote>
      <button type="button" class="m-ai__btn m-ai__again" data-action="again" :disabled="!enabled" @click="emit('ask')">Gợi ý lại</button>
      <div v-if="sources.length" class="m-ai__sources">
        <p class="m-ai__label">Nguồn tham khảo</p>
        <ul>
          <li v-for="(s, i) in sources" :key="i">{{ s }}</li>
        </ul>
      </div>
    </template>
    <div v-else class="m-ai__empty">
      <p>Bấm nút bên dưới để AI đọc hội thoại và gợi ý một câu trả lời. Gợi ý chỉ được đưa vào ô soạn khi bạn bấm “Áp vào nháp”.</p>
      <button type="button" class="m-ai__btn m-ai__btn--primary" :disabled="!enabled" @click="emit('ask')">Nhờ AI gợi ý</button>
    </div>

    <p v-if="typeof remaining === 'number'" class="m-ai__usage">Còn {{ remaining }} lượt AI hôm nay</p>

    <template #footer>
      <template v-if="suggestion && !loading && !error">
        <button
          v-if="hasDraft"
          type="button"
          class="m-ai__btn m-ai__foot-btn"
          data-action="append"
          @click="apply('append')"
        >Chèn vào cuối nháp</button>
        <button
          type="button"
          class="m-ai__btn m-ai__btn--primary m-ai__foot-btn"
          data-action="apply"
          @click="apply('replace')"
        >{{ hasDraft ? 'Thay nháp hiện tại' : 'Áp vào nháp' }}</button>
      </template>
      <button v-else type="button" class="m-ai__btn m-ai__foot-btn" @click="emit('update:open', false)">Đóng</button>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import type { AISuggestionSheetEmits, AISuggestionSheetProps } from './types';

const props = defineProps<AISuggestionSheetProps>();
const emit = defineEmits<AISuggestionSheetEmits>();

const hasDraft = computed(() => props.currentDraft.trim() !== '');

function apply(mode: 'replace' | 'append') {
  if (!props.suggestion) return;
  emit('applyDraft', { conversationId: props.conversationId, text: props.suggestion, mode });
}
</script>

<style scoped>
.m-ai__note,
.m-ai__review,
.m-ai__loading,
.m-ai__error,
.m-ai__empty p {
  margin: 0 0 var(--m-space-3);
  font-size: var(--m-font-body);
  line-height: 1.45;
}
.m-ai__note {
  color: var(--m-muted);
  font-size: var(--m-font-meta);
}
.m-ai__review {
  display: flex;
  gap: var(--m-space-2);
  padding: var(--m-space-3);
  border-radius: var(--m-radius-md);
  background: var(--m-warning-soft);
  color: var(--m-warning);
  font-weight: 650;
}
.m-ai__error {
  color: var(--m-danger);
}
.m-ai__label {
  margin: 0 0 var(--m-space-1);
  font-size: var(--m-font-meta);
  font-weight: 650;
  color: var(--m-muted);
}
.m-ai__text {
  margin: 0 0 var(--m-space-3);
  padding: var(--m-space-3);
  border-left: 4px solid var(--m-brand);
  border-radius: var(--m-radius-sm);
  background: var(--m-brand-soft);
  color: var(--m-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.m-ai__sources ul {
  margin: 0 0 var(--m-space-3);
  padding-left: var(--m-space-5);
  font-size: var(--m-font-meta);
  color: var(--m-muted);
}
.m-ai__usage {
  margin: 0;
  font-size: var(--m-font-meta);
  color: var(--m-muted);
}
.m-ai__btn {
  min-height: var(--m-touch);
  padding: 0 var(--m-space-4);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md);
  background: var(--m-surface);
  color: var(--m-text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  touch-action: manipulation;
}
.m-ai__btn--primary {
  border-color: transparent;
  background: var(--m-brand-strong);
  color: var(--m-on-action);
}
.m-ai__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.m-ai__btn:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-ai__again {
  margin-bottom: var(--m-space-3);
}
.m-ai__foot-btn {
  flex: 1;
}
</style>
