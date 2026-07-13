<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  CareSessionListPanel — panel dùng chung cho Phiên chăm sóc + Bám đuổi thủ công (Phase 4.1).
  Hiển thị dữ liệu THẬT từ GET /api/v1/automation/care-sessions. CHỈ READ + pause/stop
  (đổi trạng thái DB) — KHÔNG gửi Zalo. Có badge dry-run, thẻ tổng, search/filter,
  loading/empty/error, tiến độ bước.
-->
<template>
  <div class="cs-view">
    <div class="mkt-top">
      <div>
        <div class="mtt">
          {{ title }}
          <span v-if="dryRun" class="dry-badge" title="Production đang bật dry-run — worker chỉ ghi mock, KHÔNG gửi Zalo thật">
            <v-icon size="13">mdi-shield-check-outline</v-icon> Dry-run · không gửi thật
          </span>
        </div>
        <div class="mts">{{ description }}</div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="reload">
          <v-icon size="16">mdi-refresh</v-icon> Làm mới
        </button>
      </div>
    </div>

    <!-- Thẻ tổng -->
    <div class="cs-cards">
      <button class="cs-card" :class="{ on: filters.state === 'all' }" @click="setState('all')">
        <div class="cs-num">{{ summary.total }}</div><div class="cs-lbl">Tất cả</div>
      </button>
      <button class="cs-card run" :class="{ on: filters.state === 'running' }" @click="setState('running')">
        <div class="cs-num">{{ summary.running }}</div><div class="cs-lbl">Đang chạy</div>
      </button>
      <button class="cs-card pause" :class="{ on: filters.state === 'paused' }" @click="setState('paused')">
        <div class="cs-num">{{ summary.paused }}</div><div class="cs-lbl">Tạm dừng</div>
      </button>
      <button class="cs-card done" :class="{ on: filters.state === 'completed' }" @click="setState('completed')">
        <div class="cs-num">{{ summary.completed }}</div><div class="cs-lbl">Hoàn thành</div>
      </button>
      <button class="cs-card stop" :class="{ on: filters.state === 'stopped' }" @click="setState('stopped')">
        <div class="cs-num">{{ summary.stopped }}</div><div class="cs-lbl">Đã dừng</div>
      </button>
    </div>

    <!-- Search -->
    <div class="cs-toolbar">
      <div class="cs-search">
        <v-icon size="16">mdi-magnify</v-icon>
        <input v-model="filters.q" class="cs-search-input" placeholder="Tìm theo tên khách / SĐT…" @input="debouncedLoad" />
      </div>
    </div>

    <div class="cs-body">
      <div v-if="loading" class="cs-empty">Đang tải…</div>
      <div v-else-if="error" class="cs-empty cs-error">
        <v-icon size="34">mdi-alert-circle-outline</v-icon>
        <p>{{ error }}</p>
        <button class="btn btn-ghost btn-sm" @click="reload">Thử lại</button>
      </div>
      <div v-else-if="sessions.length === 0" class="cs-empty">
        <v-icon size="40">mdi-account-heart-outline</v-icon>
        <p v-if="hasFilter">Không có phiên nào khớp bộ lọc.</p>
        <p v-else>{{ emptyText }}</p>
      </div>

      <div v-else class="cs-list">
        <div v-for="s in sessions" :key="s.id" class="cs-item" :class="'st-' + s.state">
          <div class="cs-main">
            <div class="cs-line1">
              <span class="cs-name">{{ s.contactName }}</span>
              <span v-if="s.contactPhone" class="cs-phone">{{ s.contactPhone }}</span>
              <span class="cs-badge" :class="'b-' + s.state">
                {{ stateLabel(s.state) }}<template v-if="s.state === 'running' && s.dryRun"> · dry-run</template>
              </span>
            </div>
            <div class="cs-line2">
              <span class="cs-seq"><v-icon size="13">mdi-target-variant</v-icon> {{ s.sequenceName }}</span>
              <span class="cs-nick"><v-icon size="13">mdi-account-circle-outline</v-icon> {{ s.nickName }}</span>
              <span class="cs-prog">{{ progressLabel(s) }}</span>
            </div>
            <div class="cs-line3">
              <span v-if="s.state === 'running' && s.nextRunAt">Bước kế: {{ relTime(s.nextRunAt) }}</span>
              <span v-else-if="s.state === 'paused' && s.pausedUntil">Chạy lại {{ relTime(s.pausedUntil) }}</span>
              <span v-else-if="s.lastSentAt">Gửi gần nhất {{ relTime(s.lastSentAt) }}</span>
              <span v-if="s.lastReplyAt" class="cs-reply"><v-icon size="12">mdi-message-reply-text-outline</v-icon> KH trả lời {{ relTime(s.lastReplyAt) }}</span>
              <span v-if="s.state === 'stopped' && s.closedReason" class="cs-reason">Lý do: {{ s.closedReason }}</span>
            </div>
          </div>
          <div v-if="s.state === 'running' || s.state === 'paused'" class="cs-actions">
            <button class="btn btn-ghost btn-sm" title="Tạm dừng 24h" @click="onPause(s)">
              <v-icon size="16">mdi-pause-circle-outline</v-icon>
            </button>
            <button class="btn btn-ghost btn-sm danger" title="Dừng hẳn" @click="onStop(s)">
              <v-icon size="16">mdi-stop-circle-outline</v-icon>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { useCareSessions } from '@/composables/use-care-sessions';
import { stateLabel, progressLabel, relTime, type CareSessionItem } from '@/composables/care-session-view-logic';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';

const props = defineProps<{
  title: string;
  description: string;
  emptyText: string;
  sourceType?: 'sequence_manual' | 'target_followup';
}>();

const { push: toast } = useToast();
const { confirm } = useConfirm();

const { sessions, summary, dryRun, loading, error, load, pause, stop } = useCareSessions(props.sourceType);
const filters = reactive({ state: 'all', q: '' });
const hasFilter = computed(() => filters.state !== 'all' || !!filters.q.trim());

function reload(): void { void load({ state: filters.state, q: filters.q }); }
function setState(s: string): void { filters.state = s; reload(); }

let timer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoad(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(reload, 300);
}

async function onPause(s: CareSessionItem): Promise<void> {
  try { await pause(s, 24); toast('Đã tạm dừng phiên 24 giờ', 'success'); reload(); }
  catch { toast('Không tạm dừng được', 'error'); }
}
async function onStop(s: CareSessionItem): Promise<void> {
  if (!(await confirm({
    title: 'Dừng phiên chăm sóc?',
    message: `Dừng hẳn phiên bám đuổi cho "${s.contactName}". Không gửi thêm bước nào. Không thể hoàn tác.`,
    confirmText: 'Dừng', tone: 'danger',
  }))) return;
  try { await stop(s, 'sale_resolved'); toast('Đã dừng phiên', 'success'); reload(); }
  catch { toast('Không dừng được', 'error'); }
}

onMounted(reload);
</script>

<style scoped>
.cs-view { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.mkt-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 20px 12px; border-bottom: 1px solid var(--border, #e5e4e7); }
.mtt { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dry-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: #8a5a00; background: #fff3d6; border: 1px solid #f0d999; padding: 2px 8px; border-radius: 999px; }
.mts { font-size: 13px; color: var(--text-secondary, #666); margin-top: 2px; max-width: 760px; line-height: 1.5; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.cs-cards { display: flex; gap: 10px; padding: 14px 20px 4px; flex-wrap: wrap; }
.cs-card { border: 1px solid var(--border, #e5e4e7); border-radius: 10px; padding: 10px 16px; min-width: 92px; text-align: left; background: var(--surface, #fff); cursor: pointer; }
.cs-card.on { border-color: #0f6fa0; box-shadow: 0 0 0 1px #0f6fa0 inset; }
.cs-num { font-size: 20px; font-weight: 800; color: #0e445a; }
.cs-lbl { font-size: 12px; color: var(--text-secondary, #666); margin-top: 2px; }
.cs-card.run .cs-num { color: #0f6fa0; }
.cs-card.pause .cs-num { color: #8a5a00; }
.cs-card.done .cs-num { color: #1b7a3d; }
.cs-card.stop .cs-num { color: #6b7280; }
.cs-toolbar { display: flex; gap: 8px; padding: 10px 20px; }
.cs-search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 4px 10px; flex: 1; min-width: 200px; }
.cs-search-input { border: none; outline: none; background: none; flex: 1; font-size: 13.5px; color: inherit; }
.cs-body { padding: 4px 20px 20px; }
.cs-empty { text-align: center; color: var(--text-secondary, #888); padding: 40px 0; }
.cs-error { color: #a12318; }
.cs-list { display: flex; flex-direction: column; gap: 8px; }
.cs-item { display: flex; justify-content: space-between; gap: 12px; border: 1px solid var(--border, #e5e4e7); border-left-width: 3px; border-radius: 10px; padding: 11px 14px; background: var(--surface, #fff); }
.cs-item.st-running { border-left-color: #0f6fa0; }
.cs-item.st-paused { border-left-color: #d99e00; }
.cs-item.st-completed { border-left-color: #1b7a3d; }
.cs-item.st-stopped { border-left-color: #9aa0a6; }
.cs-main { min-width: 0; flex: 1; }
.cs-line1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cs-name { font-weight: 700; font-size: 14px; }
.cs-phone { font-size: 12px; color: var(--text-secondary, #888); }
.cs-badge { font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; }
.cs-badge.b-running { background: #e6f0fb; color: #0f6fa0; }
.cs-badge.b-paused { background: #fff3d6; color: #8a5a00; }
.cs-badge.b-completed { background: #e1f5e9; color: #1b7a3d; }
.cs-badge.b-stopped { background: #ececf0; color: #555; }
.cs-line2 { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 5px; font-size: 12.5px; color: #42526e; }
.cs-line2 .v-icon { vertical-align: -2px; margin-right: 2px; }
.cs-prog { font-weight: 600; color: #0f6ea3; }
.cs-line3 { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 5px; font-size: 11.8px; color: var(--text-secondary, #888); }
.cs-reply { color: #1b7a3d; }
.cs-reason { color: #a12318; }
.cs-actions { display: flex; gap: 4px; align-items: flex-start; flex-shrink: 0; }
.danger { color: #a12318; }
</style>
