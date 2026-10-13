<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <section class="tiktok-panel" aria-label="Kết nối TikTok Personal" :aria-busy="busy">
    <strong>Đăng nhập TikTok</strong>
    <p class="hint">Thử nghiệm một tài khoản. Chọn mã QR hoặc tài khoản và mật khẩu.</p>

    <form v-if="!account" @submit.prevent="createAccount">
      <label for="tiktok-username">Username TikTok</label>
      <input id="tiktok-username" v-model.trim="username" autocomplete="off" placeholder="ten_tai_khoan" maxlength="65" />
      <button type="submit" :disabled="busy || !username">Tạo kết nối</button>
    </form>

    <div v-else class="account">
      <span><strong>{{ account.displayName }}</strong> · {{ statusLabel(connection?.account.status ?? account.status) }}</span>
      <fieldset v-if="connection?.account.status !== 'CONNECTED'" class="login-method">
        <legend>Phương thức đăng nhập</legend>
        <label>
          <input v-model="loginMethod" type="radio" value="qr" />
          Sử dụng mã QR
        </label>
        <label>
          <input v-model="loginMethod" type="radio" value="password" />
          Sử dụng số điện thoại, email hoặc username
        </label>
      </fieldset>

      <button
        v-if="connection?.account.status !== 'CONNECTED' && loginMethod === 'qr'"
        type="button"
        :disabled="busy"
        @click="connectWithQr"
      >
        Tạo mã QR
      </button>

      <form
        v-if="connection?.account.status !== 'CONNECTED' && loginMethod === 'password'"
        class="password-login"
        @submit.prevent="connectWithPassword"
      >
        <label for="tiktok-login-identifier">Số điện thoại, email hoặc username</label>
        <input
          id="tiktok-login-identifier"
          v-model.trim="loginIdentifier"
          autocomplete="username"
          maxlength="128"
          placeholder="Email hoặc username"
        />
        <label for="tiktok-login-password">Mật khẩu</label>
        <input
          id="tiktok-login-password"
          v-model="loginPassword"
          type="password"
          autocomplete="current-password"
          maxlength="256"
          placeholder="Mật khẩu TikTok"
        />
        <button type="submit" :disabled="busy || !loginIdentifier || !loginPassword">
          Đăng nhập
        </button>
        <small>Mật khẩu chỉ chuyển một lần đến worker, không lưu trong cơ sở dữ liệu hoặc log.</small>
      </form>

      <button
        v-if="connection?.account.status === 'CONNECTED'"
        type="button"
        :disabled="busy"
        @click="setOutbound(!connection.account.outboundEnabled)"
      >
        {{ connection.account.outboundEnabled ? 'Tắt gửi tin' : 'Bật gửi tin' }}
      </button>
      <form v-if="connection?.runtime?.errorCode === 'VERIFICATION_CODE_REQUIRED'" @submit.prevent="verifyLogin">
        <label for="tiktok-verification-code">Mã xác minh TikTok gồm 6 chữ số</label>
        <input id="tiktok-verification-code" v-model="verificationCode" type="password" inputmode="numeric"
          autocomplete="off" maxlength="6" placeholder="Nhập mã từ email hoặc SMS của anh" />
        <button type="submit" :disabled="busy || !/^\d{6}$/.test(verificationCode)">Xác nhận đăng nhập</button>
        <small>Mã chỉ chuyển một lần đến phiên TikTok hiện tại; không lưu vào DB hoặc log.</small>
      </form>
      <button type="button" :disabled="busy" @click="loadConnection">Làm mới trạng thái</button>
      <button v-if="connection?.account.status !== 'DISCONNECTED'" type="button" class="disconnect" :disabled="busy" @click="disconnect">
        Ngắt kết nối
      </button>

      <div v-if="connection?.runtime?.qrDataUrl" class="qr" aria-live="polite">
        <img :src="connection.runtime.qrDataUrl" alt="Mã QR đăng nhập TikTok" width="240" height="240" />
        <small>Quét bằng ứng dụng TikTok. Không nhập OTP khi đang dùng phương thức QR.</small>
      </div>
      <div v-if="connection" class="details" aria-live="polite">
        <small>Account ID: <code>{{ account.id }}</code></small>
        <small>Epoch: <code>{{ connection.epoch ?? 'chưa tạo' }}</code></small>
        <small v-if="connection.runtime?.state === 'login_pending'">TikTok đang xử lý yêu cầu đăng nhập.</small>
        <small v-if="connection.runtime?.state === 'challenge'">Hãy hoàn tất xác minh hoặc xác nhận trong ứng dụng TikTok.</small>
        <small v-if="connection.runtime?.errorCode" class="error">
          {{ runtimeErrorLabel(connection.runtime.errorCode) }}
        </small>
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
const loginMethod = ref<'qr' | 'password'>('qr');
const loginIdentifier = ref('');
const loginPassword = ref('');
const verificationCode = ref('');
const connection = ref<Connection | null>(null);
const busy = ref(false);
const error = ref('');
let timer: number | undefined;

const statusLabel = (status?: string) => ({
  CONNECTED: 'đã kết nối', QR_PENDING: 'đang chờ đăng nhập', CHALLENGE: 'cần xác minh trong TikTok',
  SESSION_EXPIRED: 'phiên hết hạn', IDENTITY_MISMATCH: 'sai tài khoản', ERROR: 'lỗi', DISCONNECTED: 'chưa kết nối',
}[status ?? ''] ?? status ?? 'không rõ');

const runtimeErrorLabel = (code: string) => ({
  TIKTOK_LOGIN_RATE_LIMITED: 'TikTok đang giới hạn số lần đăng nhập. Tạm ngừng thử và thử lại khi TikTok cho phép.',
  VERIFICATION_CODE_REQUIRED: 'TikTok yêu cầu xác minh 2 bước. Nhập mã vào ô xác minh phía trên.',
  TIKTOK_LOGIN_REJECTED: 'TikTok từ chối đăng nhập. Kiểm tra lại tài khoản, mật khẩu hoặc giới hạn thử đăng nhập.',
  PASSWORD_LOGIN_NOT_COMPLETED: 'TikTok chưa hoàn tất đăng nhập. Tài khoản có thể cần xác minh thêm trong TikTok.',
  IDENTITY_NOT_OBSERVED: 'Đã mở được hộp thư nhưng chưa xác nhận được đúng username của tài khoản.',
}[code] ?? `Mã lỗi TikTok: ${code}`);

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

async function connect(payload: { method: 'qr' } | { method: 'password'; identifier: string; password: string }) {
  if (!account.value) return;
  busy.value = true; error.value = '';
  try {
    await api.post(`/channel-accounts/tiktok/${account.value.id}/connect`, payload);
    await loadConnection(); emit('changed');
  } catch {
    error.value = payload.method === 'qr'
      ? 'Không tạo được mã QR TikTok.'
      : 'Không chuyển được yêu cầu đăng nhập TikTok.';
  } finally {
    if (payload.method === 'password') loginPassword.value = '';
    busy.value = false;
  }
}

const connectWithQr = () => connect({ method: 'qr' });
const connectWithPassword = () => connect({
  method: 'password',
  identifier: loginIdentifier.value,
  password: loginPassword.value,
});

async function verifyLogin() {
  if (!account.value || !connection.value?.epoch) return;
  busy.value = true; error.value = '';
  try {
    await api.post(`/channel-accounts/tiktok/${account.value.id}/verify`, {
      epoch: connection.value.epoch, code: verificationCode.value,
    });
    await loadConnection();
  } catch { error.value = 'Không chuyển được mã xác minh. Kiểm tra phiên hiện tại và trạng thái TikTok.'; }
  finally { verificationCode.value = ''; busy.value = false; }
}

watch(() => connection.value?.epoch, () => { verificationCode.value = ''; });

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
watch(() => account.value?.displayName, value => {
  if (!loginIdentifier.value && value) loginIdentifier.value = value.replace(/^@/, '');
}, { immediate: true });
onMounted(() => { timer = window.setInterval(() => void loadConnection(), 3000); });
onUnmounted(() => { if (timer) window.clearInterval(timer); });
</script>

<style scoped>
.tiktok-panel { margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,.12); }
.hint { font-size:12px; opacity:.72; }
form,.account,.qr,.details,.login-method { display:grid; gap:8px; margin-top:10px; }
input,button { max-width:100%; min-height:44px; }
input { padding:8px 10px; }
.login-method { border:1px solid rgba(255,255,255,.18); border-radius:8px; padding:10px; }
.login-method label { display:flex; align-items:center; gap:8px; }
.login-method input { min-height:auto; }
.password-login small { opacity:.72; line-height:1.45; }
button:focus-visible,input:focus-visible { outline:3px solid #60a5fa; outline-offset:2px; }
button:disabled { cursor:not-allowed; opacity:.55; }
.qr img { width:240px; max-width:100%; height:auto; background:#fff; padding:8px; border-radius:8px; }
.details code { overflow-wrap:anywhere; }
.disconnect,.error { color:#fecaca; }
</style>
