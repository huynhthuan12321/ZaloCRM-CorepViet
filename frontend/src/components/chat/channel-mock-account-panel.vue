<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <section class="mock-panel" aria-label="Tài khoản kênh thử nghiệm" :aria-busy="busy">
    <strong>TT09 — giới hạn worker theo tài nguyên</strong>
    <p class="hint">Chỉ dùng local/test. QR này là dữ liệu mô phỏng, không đăng nhập TikTok.</p>
    <div v-if="fleet" class="fleet" aria-live="polite">
      <strong>TT09 fleet: {{ fleet.capacity.activeWorkers }}/{{ fleet.capacity.effectiveLimit }} worker</strong>
      <small>
        Còn {{ fleet.capacity.remainingSlots }} slot ·
        headroom {{ bytesLabel(fleet.capacity.headroomBytes) }}
      </small>
      <small v-if="fleet.capacity.alerts.length">Cảnh báo fleet: {{ fleet.capacity.alerts.join(', ') }}</small>
    </div>
    <form v-if="!fleet || accounts.length < fleet.capacity.effectiveLimit" @submit.prevent="createAccount">
      <label for="mock-account-name">Tên tài khoản thử</label>
      <input id="mock-account-name" v-model.trim="displayName" maxlength="120" />
      <button type="submit" :disabled="busy || !displayName">Tạo tài khoản thử</button>
    </form>
    <div v-for="account in accounts" :key="account.id" class="account">
      <span>{{ account.displayName }} · {{ statusLabel(account.status) }}</span>
      <button v-if="account.status !== 'CONNECTED'" type="button" :disabled="busy" @click="connect(account.id)">
        Tạo QR thử
      </button>
      <button v-else type="button" :disabled="busy" @click="setOutbound(account.id, !account.outboundEnabled)">
        {{ account.outboundEnabled ? 'Tắt gửi thử' : 'Bật gửi thử' }}
      </button>
      <button type="button" :disabled="busy" @click="loadPilot(account.id)">Làm mới giám sát</button>
      <div v-if="pilot[account.id]" class="pilot" aria-live="polite">
        <strong>Pilot: {{ pilot[account.id].status }}</strong>
        <small>Heartbeat: {{ heartbeatLabel(pilot[account.id].worker?.heartbeatAgeMs) }}</small>
        <small>
          Outbox: {{ pilot[account.id].outbound.pending }} chờ ·
          {{ pilot[account.id].outbound.processing }} xử lý ·
          {{ pilot[account.id].outbound.unknown }} chưa rõ
        </small>
        <small>RSS worker: {{ bytesLabel(pilot[account.id].worker?.rssBytes) }}</small>
        <small v-if="pilot[account.id].alerts.length">Cảnh báo: {{ pilot[account.id].alerts.join(', ') }}</small>
        <small v-else>Không có cảnh báo mock hiện tại.</small>
      </div>
      <button type="button" class="rollback" :disabled="busy" @click="rollback(account.id)">
        Diễn tập rollback
      </button>
      <div v-if="pending?.accountId === account.id" class="qr">
        <code>{{ pending.qr }}</code>
        <small>Epoch phiên thử: {{ pending.epoch }}</small>
        <label :for="`mock-external-account-${account.id}`">Định danh tài khoản thử</label>
        <input :id="`mock-external-account-${account.id}`" v-model.trim="externalAccountId" maxlength="200" />
        <button type="button" :disabled="busy || !externalAccountId" @click="confirm(account.id)">
          Mô phỏng quét và xác nhận
        </button>
      </div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api/index';

interface Account { id: string; displayName: string; provider: string; status?: string; outboundEnabled?: boolean }
interface PilotStatus {
  status: 'HEALTHY' | 'DEGRADED';
  worker: { heartbeatAgeMs: number; rssBytes: number } | null;
  outbound: { pending: number; processing: number; confirmed: number; failed: number; unknown: number };
  alerts: string[];
}
interface FleetStatus {
  capacity: {
    activeWorkers: number;
    effectiveLimit: number;
    remainingSlots: number;
    headroomBytes: number;
    alerts: string[];
  };
}
const props = defineProps<{ accounts: Account[] }>();
const emit = defineEmits<{ changed: [] }>();
const displayName = ref('TikTok Personal thử nghiệm');
const externalAccountId = ref('mock-personal-01');
const pending = ref<{ accountId: string; qr: string; epoch: string } | null>(null);
const busy = ref(false);
const error = ref('');
const pilot = ref<Record<string, PilotStatus>>({});
const fleet = ref<FleetStatus | null>(null);

const statusLabel = (status?: string) => ({
  CONNECTED: 'đã kết nối',
  QR_PENDING: 'chờ xác nhận',
  DISCONNECTED: 'chưa kết nối',
}[status ?? ''] ?? status ?? 'không rõ');

async function createAccount() {
  busy.value = true; error.value = '';
  try {
    await api.post('/channel-accounts/mock', { displayName: displayName.value });
    emit('changed');
  } catch {
    error.value = 'Không thể tạo tài khoản thử. Cần quyền quản trị tài khoản kênh.';
  } finally { busy.value = false; }
}

async function connect(accountId: string) {
  busy.value = true; error.value = '';
  try {
    const { data } = await api.post(`/channel-accounts/mock/${accountId}/connect`);
    pending.value = { accountId, qr: data.qr, epoch: data.epoch };
    const index = props.accounts.findIndex(account => account.id === accountId);
    externalAccountId.value = `mock-personal-${String(Math.max(0, index) + 1).padStart(2, '0')}`;
    emit('changed');
  } catch {
    error.value = 'Không thể tạo phiên QR thử.';
  } finally { busy.value = false; }
}

async function confirm(accountId: string) {
  busy.value = true; error.value = '';
  try {
    await api.post(`/channel-accounts/mock/${accountId}/confirm`, {
      externalAccountId: externalAccountId.value,
      displayName: props.accounts.find(account => account.id === accountId)?.displayName,
      epoch: pending.value?.epoch,
    });
    pending.value = null;
    emit('changed');
  } catch {
    error.value = 'Không thể xác nhận danh tính tài khoản thử.';
  } finally { busy.value = false; }
}

async function setOutbound(accountId: string, enabled: boolean) {
  busy.value = true; error.value = '';
  try {
    await api.patch(`/channel-accounts/mock/${accountId}/outbound`, { enabled });
    emit('changed');
  } catch {
    error.value = 'Không thể đổi trạng thái gửi thử. Cần quyền quản trị và phiên mock đã xác nhận.';
  } finally { busy.value = false; }
}

async function loadPilot(accountId: string) {
  try {
    const { data } = await api.get(`/channel-accounts/mock/${accountId}/pilot`);
    pilot.value = { ...pilot.value, [accountId]: data };
  } catch {
    // Endpoint is admin-only. Readers keep the inbox without operational metadata.
    const next = { ...pilot.value };
    delete next[accountId];
    pilot.value = next;
  }
}

async function loadFleet() {
  try {
    const { data } = await api.get('/channel-accounts/mock/fleet');
    fleet.value = data;
  } catch {
    fleet.value = null;
  }
}

async function rollback(accountId: string) {
  if (!window.confirm('Rollback sẽ ngắt phiên mock và tắt nhận/gửi. Tiếp tục?')) return;
  busy.value = true; error.value = '';
  try {
    await api.post(`/channel-accounts/mock/${accountId}/rollback`);
    const next = { ...pilot.value };
    delete next[accountId];
    pilot.value = next;
    emit('changed');
  } catch {
    error.value = 'Không thể diễn tập rollback. Cần quyền quản trị tài khoản mock.';
  } finally { busy.value = false; }
}

const heartbeatLabel = (age?: number | null) => age == null ? 'chưa có' : `${Math.round(age / 1000)} giây trước`;
const bytesLabel = (bytes?: number | null) => bytes == null ? 'chưa có' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

watch(() => props.accounts.map(account => account.id).join(','), () => {
  void loadFleet();
  for (const account of props.accounts) void loadPilot(account.id);
}, { immediate: true });
</script>

<style scoped>
.mock-panel { margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,.12); }
.hint { font-size:12px; opacity:.72; }
form,.account,.qr { display:grid; gap:8px; margin-top:10px; }
input,button { max-width:100%; min-height:44px; }
input { padding:8px 10px; }
button:focus-visible,input:focus-visible { outline:3px solid #60a5fa; outline-offset:2px; }
button:disabled,input:disabled { cursor:not-allowed; opacity:.55; }
.qr code { overflow-wrap:anywhere; padding:8px; background:rgba(255,255,255,.06); }
.pilot { display:grid; gap:4px; padding:8px; border:1px solid rgba(96,165,250,.55); border-radius:6px; }
.fleet { display:grid; gap:4px; margin-top:10px; padding:8px; border:1px solid rgba(52,211,153,.55); border-radius:6px; }
.rollback { color:#fecaca; border-color:#b91c1c; }
.error { color:#ff8a8a; }
</style>
