<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <section class="tiktok-panel" aria-label="Kết nối TikTok Personal" :aria-busy="busy">
    <strong>TikTok Personal</strong>
    <p class="hint">Thử nghiệm một tài khoản. QR chỉ hiện cho quản trị viên.</p>

    <form v-if="!account" @submit.prevent="createAccount">
      <label for="tiktok-username">Username TikTok</label>
      <input id="tiktok-username" v-model.trim="username" autocomplete="off" placeholder="ten_tai_khoan" maxlength="65" />
      <button type="submit" :disabled="busy || !username">Tạo kết nối</button>
    </form>

    <div v-else class="account">
      <span><strong>{{ account.displayName }}</strong> · {{ statusLabel(connection?.account.status ?? account.status) }}</span>
      <button v-if="connection?.account.status !== 'CONNECTED'" type="button" :disabled="busy" @click="connect">
        {{ connection?.epoch ? 'Tạo QR mới' : 'Bắt đầu kết nối' }}
      </button>
      <button v-else type="button" :disabled="busy" @click="setOutbound(!connection.account.outboundEnabled)">
        {{ connection.account.outboundEnabled ? 'Tắt gửi tin' : 'Bật gửi tin' }}
      </button>
      <button type="button" :disabled="busy" @click="loadConnection">Làm mới trạng thái</button>
      <button v-if="connection?.account.status !== 'DISCONNECTED'" type="button" class="disconnect" :disabled="busy" @click="disconnect">
        Ngắt kết nối
      </button>

      <div v-if="connection?.runtime?.qrDataUrl" class="qr" aria-live="polite">
        <img :src="connection.runtime.qrDataUrl" alt="Mã QR đăng nhập TikTok" width="240" height="240" />
        <small>Quét bằng ứng dụng TikTok. Không gửi cookie, OTP hoặc mật khẩu vào CRM.</small>
      </div>
      <div v-if="connection" class="details" aria-live="polite">
        <small>Account ID: <code>{{ account.id }}</code></small>
        <small>Epoch: <code>{{ connection.epoch ?? 'chưa tạo' }}</code></small>
        <small v-if="connection.runtime?.errorCode">Mã lỗi: {{ connection.runtime.errorCode }}</small>
      </div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api } from '@/api/index';

interface Account { id: string; displayName: string; provider: string; status?: string; outboundEnabled?: boolean }
interface Connection {
  account: { id: string; displayName: string; externalAccountId: string; status: string; inboundEnabled: boolean; outboundEnabled: boolean };
  epoch: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  runtime?: { state: string; qrDataUrl?: string; errorCode?: string; observedAt: string } | null;
}

const props = defineProps<{ accounts: Account[] }>();
const emit = defineEmits<{ changed: [] }>();
const account = computed(() => props.accounts.find(item => item.provider === 'TIKTOK_WEB_SESSION') ?? null);
const username = ref('');
const connection = ref<Connection | null>(null);
const busy = ref(false);
const error = ref('');
let timer: number | undefined;

const statusLabel = (status?: string) => ({
  CONNECTED: 'đã kết nối', QR_PENDING: 'đang chờ QR', CHALLENGE: 'cần xác minh trong TikTok',
  SESSION_EXPIRED: 'phiên hết hạn', IDENTITY_MISMATCH: 'sai tài khoản', ERROR: 'lỗi', DISCONNECTED: 'chưa kết nối',
}[status ?? ''] ?? status ?? 'không rõ');

async function createAccount() {
  busy.value = true; error.value = '';
  try {
    await api.post('/channel-accounts/tiktok', { username: username.value });
    emit('changed');
  } catch (cause: any) {
    error.value = cause?.response?.data?.code === 'TIKTOK_SINGLE_ACCOUNT_LIMIT'
      ? 'Pilot hiện chỉ cho phép một tài khoản TikTok.'
      : 'Không thể tạo tài khoản TikTok. Kiểm tra username và quyền quản trị.';
  } finally { busy.value = false; }
}

async function loadConnection() {
  if (!account.value) { connection.value = null; return; }
  try {
    const { data } = await api.get(`/channel-accounts/tiktok/${account.value.id}/connection`);
    connection.value = data;
  } catch { error.value = 'Không đọc được trạng thái kết nối TikTok.'; }
}

async function connect() {
  if (!account.value) return;
  busy.value = true; error.value = '';
  try {
    await api.post(`/channel-accounts/tiktok/${account.value.id}/connect`);
    await loadConnection(); emit('changed');
  } catch { error.value = 'Không tạo được phiên đăng nhập TikTok.'; }
  finally { busy.value = false; }
}

async function setOutbound(enabled: boolean) {
  if (!account.value) return;
  busy.value = true; error.value = '';
  try {
    await api.patch(`/channel-accounts/tiktok/${account.value.id}/outbound`, { enabled });
    await loadConnection(); emit('changed');
  } catch { error.value = 'Không đổi được quyền gửi. Phiên phải đang kết nối và cờ gửi live phải được bật.'; }
  finally { busy.value = false; }
}

async function disconnect() {
  if (!account.value || !window.confirm('Ngắt phiên TikTok hiện tại?')) return;
  busy.value = true; error.value = '';
  try {
    await api.post(`/channel-accounts/tiktok/${account.value.id}/disconnect`);
    await loadConnection(); emit('changed');
  } catch { error.value = 'Không thể ngắt phiên TikTok.'; }
  finally { busy.value = false; }
}

watch(() => account.value?.id, () => void loadConnection(), { immediate: true });
onMounted(() => { timer = window.setInterval(() => void loadConnection(), 3000); });
onUnmounted(() => { if (timer) window.clearInterval(timer); });
</script>

<style scoped>
.tiktok-panel { margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,.12); }
.hint { font-size:12px; opacity:.72; }
form,.account,.qr,.details { display:grid; gap:8px; margin-top:10px; }
input,button { max-width:100%; min-height:44px; }
input { padding:8px 10px; }
button:focus-visible,input:focus-visible { outline:3px solid #60a5fa; outline-offset:2px; }
button:disabled { cursor:not-allowed; opacity:.55; }
.qr img { width:240px; max-width:100%; height:auto; background:#fff; padding:8px; border-radius:8px; }
.details code { overflow-wrap:anywhere; }
.disconnect,.error { color:#fecaca; }
</style>
