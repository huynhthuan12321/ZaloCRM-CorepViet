<!--
  PoolListModal — Phase 2026-05-28.
  Tái dùng cho 2 trường hợp: list team members hoặc list idle nicks ở FAB tooltip.
  Search input + scrollable list. Scale-ready cho 50-200 items.
-->
<template>
  <div v-if="open" class="plm-overlay" @click.self="$emit('close')">
    <div class="plm-modal" role="dialog">
      <header class="plm-header">
        <div>
          <h3 class="plm-title">{{ title }}</h3>
          <p class="plm-sub">{{ items.length }} người · sắp xếp theo {{ kind === 'members' ? 'lead nhận hôm nay' : 'kết nối gần nhất' }}</p>
        </div>
        <button class="plm-close" @click="$emit('close')" aria-label="Đóng">✕</button>
      </header>

      <div class="plm-search-row">
        <input
          v-model="search"
          type="text"
          placeholder="Tìm theo tên..."
          class="plm-search-input"
          autofocus
        />
        <span class="plm-search-count">{{ filteredItems.length }} / {{ items.length }}</span>
      </div>

      <ul v-if="kind === 'members'" class="plm-list">
        <li v-for="m in filteredItems" :key="m.userId" class="plm-row">
          <div class="plm-row-avatar" :style="{ background: colorFor(m.fullName) }">
            {{ initials(m.fullName) }}
          </div>
          <div class="plm-row-info">
            <div class="plm-row-name">{{ m.fullName }}</div>
            <div class="plm-row-meta">
              <span>{{ m.requestedToday ?? 0 }} nhận</span>
              <span v-if="m.notedToday != null" class="ok">{{ m.notedToday }} note</span>
              <span v-if="m.pendingNote > 0" class="warn">{{ m.pendingNote }} chưa note</span>
            </div>
          </div>
          <button
            v-if="canReset"
            class="plm-row-action"
            @click="$emit('reset', { userId: m.userId, fullName: m.fullName })"
          >🔄 Reset</button>
        </li>
        <li v-if="filteredItems.length === 0" class="plm-empty">Không có người nào khớp "{{ search }}"</li>
      </ul>

      <ul v-else class="plm-list">
        <li v-for="n in filteredItems" :key="n.id" class="plm-row">
          <div class="plm-row-avatar" :style="{ background: colorFor(n.displayName || '?') }">
            <img v-if="n.avatarUrl" :src="n.avatarUrl" referrerpolicy="no-referrer" />
            <span v-else>{{ initials(n.displayName) }}</span>
          </div>
          <div class="plm-row-info">
            <div class="plm-row-name">{{ n.displayName || '(không tên)' }}</div>
            <div class="plm-row-meta">
              <span>💤 Rảnh · sẵn sàng chia</span>
              <span v-if="n.ownerName" class="muted">— {{ n.ownerName }}</span>
            </div>
          </div>
        </li>
        <li v-if="filteredItems.length === 0" class="plm-empty">Không có nick nào khớp "{{ search }}"</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  kind: 'members' | 'nicks';
  items: any[];
  canReset?: boolean;
}>();
defineEmits<{
  (e: 'close'): void;
  (e: 'reset', payload: { userId: string; fullName: string }): void;
}>();

const search = ref('');
watch(() => props.open, (v) => { if (v) search.value = ''; });

const filteredItems = computed(() => {
  const q = search.value.toLowerCase().trim();
  if (!q) return props.items;
  if (props.kind === 'members') return props.items.filter((m) => (m.fullName || '').toLowerCase().includes(q));
  return props.items.filter((n) =>
    (n.displayName || '').toLowerCase().includes(q) ||
    (n.ownerName || '').toLowerCase().includes(q),
  );
});

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function colorFor(s: string): string {
  const palette = ['linear-gradient(135deg,#3b82f6,#1e40af)','linear-gradient(135deg,#10b981,#059669)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#8b5cf6,#6d28d9)','linear-gradient(135deg,#ec4899,#be185d)','linear-gradient(135deg,#06b6d4,#0891b2)'];
  const h = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[h % palette.length];
}
</script>

<style scoped>
.plm-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(2px); }
.plm-modal { background: white; border-radius: 12px; width: 480px; max-width: 100%; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.3); overflow: hidden; }
.plm-header { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; background: linear-gradient(135deg, #EEF0FF 0%, #DBEAFE 100%); border-bottom: 1px solid #C7D2FE; }
.plm-header > div { flex: 1; }
.plm-title { margin: 0; font-size: 14px; font-weight: 700; color: #0F172A; }
.plm-sub { margin: 2px 0 0; font-size: 11px; color: #64748B; }
.plm-close { background: transparent; border: none; cursor: pointer; font-size: 15px; color: #475569; padding: 4px 8px; border-radius: 6px; line-height: 1; }
.plm-close:hover { background: rgba(0,0,0,0.08); color: #DC2626; }
.plm-search-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid #F1F5F9; }
.plm-search-input { flex: 1; padding: 7px 12px; border: 1px solid #C7D2FE; border-radius: 9999px; font-size: 12.5px; font-family: inherit; background: #F8FAFC; outline: none; }
.plm-search-input:focus { border-color: #5E6AD2; background: white; box-shadow: 0 0 0 3px rgba(94, 106, 210, 0.12); }
.plm-search-count { font-size: 11px; color: #94A3B8; font-weight: 600; font-variant-numeric: tabular-nums; }
.plm-list { list-style: none; padding: 0; margin: 0; flex: 1; overflow-y: auto; max-height: 480px; }
.plm-row { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid #F1F5F9; transition: background 0.12s; }
.plm-row:hover { background: #F8FAFC; }
.plm-row-avatar { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 12px; flex-shrink: 0; overflow: hidden; }
.plm-row-avatar img { width: 100%; height: 100%; object-fit: cover; }
.plm-row-info { flex: 1; min-width: 0; }
.plm-row-name { font-size: 13px; font-weight: 600; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plm-row-meta { font-size: 11px; color: #64748B; margin-top: 2px; display: flex; gap: 8px; }
.plm-row-meta .ok { color: #047857; font-weight: 600; }
.plm-row-meta .warn { color: #B91C1C; font-weight: 600; }
.plm-row-meta .muted { color: #94A3B8; }
.plm-row-action { flex-shrink: 0; background: #EEF0FF; border: 1px solid #C7D2FE; color: #4F46E5; font-weight: 700; font-size: 11px; padding: 4px 10px; border-radius: 7px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
.plm-row-action:hover { background: #5E6AD2; color: white; border-color: #5E6AD2; }
.plm-empty { padding: 24px; text-align: center; font-size: 12px; color: #94A3B8; }
</style>
