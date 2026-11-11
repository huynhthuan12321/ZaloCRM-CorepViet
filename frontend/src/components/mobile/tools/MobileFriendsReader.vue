<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/**
 * Bạn bè (mobile, CHỈ ĐỌC): chọn nick (hoặc Tất cả nick) + lọc loại quan hệ + tìm + tải thêm, đọc từ API friends-db hiện có.
 * Gửi/duyệt lời mời, đồng bộ, đổi alias/chặn... KHÔNG có ở đây (dùng máy tính). Không mở socket.
 */
import { reactive, ref, watch } from 'vue';
import ToolNickPicker from './ToolNickPicker.vue';
import ToolReadList from './ToolReadList.vue';
import { useMobileNicks } from '@/composables/mobile-tools/use-mobile-nicks';
import { useMobileReadList } from '@/composables/mobile-tools/use-mobile-read-list';
import { FRIEND_KINDS, fetchFriendsPage } from '@/composables/mobile-tools/mobile-tool-readers';

const nicks = useMobileNicks({ allowAll: true });
const kind = ref('all');
const counts = reactive<Record<string, number>>({});

const list = useMobileReadList({
  pageSize: 25,
  deps: () => `${nicks.state.value}|${nicks.nickId.value}|${kind.value}`,
  ready: () => nicks.state.value === 'ready' && !!nicks.nickId.value,
  load: (req) => fetchFriendsPage(nicks.nickId.value, kind.value, req, (c) => { Object.assign(counts, c); }),
});

// Số đếm thuộc về từng nick: đổi nick thì xóa ngay để không hiện số của nick cũ trong lúc đang tải.
watch(() => nicks.nickId.value, () => { for (const k of Object.keys(counts)) delete counts[k]; });
function pickNick(id: string) { nicks.select(id); }
function setKind(v: string) { kind.value = v; }
</script>

<template>
  <div class="m-fr">
    <ToolNickPicker :options="nicks.options.value" :model-value="nicks.nickId.value" :state="nicks.state.value" @update:model-value="pickNick" @retry="nicks.load()" />
    <template v-if="nicks.state.value === 'ready'">
      <div class="m-fr__kinds" role="group" aria-label="Loại quan hệ">
        <button
          v-for="k in FRIEND_KINDS" :key="k.value" type="button" class="m-fr__chip" :class="{ 'm-fr__chip--on': kind === k.value }" :aria-pressed="kind === k.value" :data-kind="k.value" @click="setKind(k.value)"
        >{{ k.label }}<template v-if="k.value !== 'all' && counts[k.value] != null"> ({{ counts[k.value] }})</template></button>
      </div>
      <ToolReadList :list="list" label="Bạn bè" search-placeholder="Tìm tên hoặc số điện thoại" empty-title="Chưa có bạn bè" empty-hint="Đồng bộ danh sách bạn bè của nick này trên máy tính." />
    </template>
  </div>
</template>

<style scoped>
.m-fr { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; }
.m-fr__kinds { display: flex; gap: var(--m-space-2); overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.m-fr__kinds::-webkit-scrollbar { display: none; }
.m-fr__chip { flex: none; display: inline-flex; align-items: center; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: 22px; background: var(--m-surface); color: var(--m-text); font: inherit; font-size: var(--m-font-meta); cursor: pointer; touch-action: manipulation; white-space: nowrap; }
.m-fr__chip--on { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.m-fr__chip:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
