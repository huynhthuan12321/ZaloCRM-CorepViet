<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <section class="channel-thread" aria-label="Hội thoại kênh" :aria-busy="loading">
    <header>
      <strong>{{ conversation.contact?.crmName || conversation.contact?.fullName || 'Hội thoại' }}</strong>
      <span>{{ conversation.channelAccount?.displayName }}</span>
    </header>
    <p v-if="!conversation.capabilities?.textSend" class="readonly-note">Chỉ xem tin nhắn — tài khoản hoặc quyền gửi chưa được bật.</p>
    <p v-else class="mock-note">Gửi thử qua fixture local. “Đã xác nhận” chỉ là fixture đã nhận, không phải khách đã nhận hoặc đã xem.</p>
    <p v-if="loading" role="status">Đang tải tin nhắn…</p>
    <div v-else class="channel-messages" role="log" aria-live="polite">
      <article v-for="message in messages" :key="message.id" :class="{ self: message.senderType === 'self' }">
        <p>{{ message.isDeleted ? 'Tin nhắn đã bị xóa' : message.contentType === 'text' ? message.content : 'Loại tin nhắn này chưa được hỗ trợ' }}</p>
        <time :datetime="message.sentAt">{{ new Date(message.sentAt).toLocaleString('vi-VN') }}</time>
        <small v-if="message.senderType === 'self' && message.channelSendState" class="send-state">
          {{ sendStateLabel(message.channelSendState) }}
        </small>
      </article>
      <p v-if="!messages.length">Chưa có tin nhắn.</p>
    </div>
    <button class="refresh-messages" type="button" :disabled="loading" @click="$emit('refresh')">Tải lại tin nhắn</button>
    <form v-if="conversation.capabilities?.textSend" class="composer" @submit.prevent="submit">
      <label for="channel-message-text">Nội dung tin nhắn</label>
      <textarea id="channel-message-text" v-model="text" :disabled="sending" maxlength="20000" />
      <button type="submit" :disabled="sending || !send || !text.trim()">{{ sending ? 'Đang gửi…' : 'Gửi thử' }}</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import type { Conversation, Message } from '@/composables/use-chat';
const props = withDefaults(defineProps<{
  conversation: Conversation;
  messages: Message[];
  loading: boolean;
  sending?: boolean;
  send?: (conversationId: string, text: string, idempotencyKey: string) => Promise<void>;
}>(), { sending: false, send: undefined });
defineEmits<{ refresh: [] }>();
const text = ref('');
const retryKey = ref<string | null>(null);
const retryText = ref('');
const error = ref('');
const sendStateLabel = (state: NonNullable<Message['channelSendState']>) => ({
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
  CONFIRMED: 'Đã xác nhận bởi fixture',
  FAILED: 'Lỗi',
  UNKNOWN: 'Chưa rõ — không tự gửi lại',
}[state]);
async function submit() {
  const value = text.value.trim();
  if (!value || !props.send) return;
  if (!retryKey.value || retryText.value !== value) {
    retryKey.value = crypto.randomUUID();
    retryText.value = value;
  }
  error.value = '';
  try {
    await props.send(props.conversation.id, value, retryKey.value);
    text.value = '';
    retryKey.value = null;
    retryText.value = '';
  } catch {
    error.value = 'Không tạo được lệnh gửi. Thử lại sẽ dùng cùng mã chống trùng.';
  }
}
</script>
<style scoped>
.channel-thread { display:flex; flex-direction:column; min-height:0; padding:16px; background:var(--color-bg,#15151c); color:var(--color-text,#ddd); }
header { display:flex; flex-direction:column; gap:5px; }
.readonly-note { padding:10px; border:1px solid #6b7280; border-radius:6px; }
.mock-note { padding:10px; border:1px solid #2563eb; border-radius:6px; color:#bfdbfe; }
.channel-messages { flex:1; overflow:auto; }
article { margin:12px 15% 12px 0; padding:10px; border:1px solid #6b7280; border-radius:8px; }
article.self { margin:12px 0 12px 15%; background:#233346; }
article p { white-space:pre-wrap; overflow-wrap:anywhere; margin:0 0 6px; }
time, .send-state { display:block; font-size:12px; opacity:.7; }
button { min-height:44px; margin-top:10px; padding:8px; }
button:focus-visible,textarea:focus-visible { outline:3px solid #60a5fa; outline-offset:2px; }
button:disabled,textarea:disabled { cursor:not-allowed; opacity:.55; }
.composer { display:grid; gap:8px; margin-top:10px; }
.composer textarea { min-height:72px; resize:vertical; padding:9px; }
.composer p { color:#fca5a5; margin:0; }
</style>
