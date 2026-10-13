<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <main style="display:grid;grid-template-columns:280px 1fr;min-height:90vh;background:#15151c;color:#eee;padding:16px;font-family:sans-serif">
    <aside><h1>Hộp thư nghiệm thu</h1><p>Dữ liệu giả lập · chỉ đọc</p>
      <p>{{channelCounts.total}} hội thoại</p>
      <button v-for="row in conversations" :key="row.id" @click="selectConversation(row.id)" style="display:block;margin:10px;padding:12px">
        {{row.contact?.fullName || row.id}}
      </button>
    </aside>
    <ChannelReadonlyThread v-if="selectedConv?.channelAccount" :conversation="selectedConv" :messages="messages" :loading="loadingMsgs"
      @refresh="selectedConvId && fetchMessages(selectedConvId)" />
    <p v-else>Chọn hội thoại kênh thử nghiệm</p>
  </main>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useChat } from '@/composables/use-chat';
import ChannelReadonlyThread from '@/components/chat/channel-readonly-thread.vue';
const chat = useChat(); chat.inboxChannel.value = 'all';
const { channelCounts, conversations, selectConversation, selectedConv, messages, loadingMsgs, selectedConvId, fetchMessages } = chat;
onMounted(async () => { chat.initSocket(); await chat.refreshChannelAccounts(); await chat.fetchConversations({ bypassCache: true }); });
onBeforeUnmount(() => chat.destroySocket());
</script>
