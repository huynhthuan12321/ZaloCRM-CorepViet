<!--
  ForcePasswordChangeView — Phase Onboarding v1 2026-05-24.
  Block UI khi user mới lần đầu login (passwordChangedAt === null).
  Không thể skip / close / logout cho tới khi đổi xong password.
-->
<template>
  <div class="fpc-page">
    <div class="fpc-card">
      <div class="fpc-icon">🔒</div>
      <h1 class="fpc-title">Đổi mật khẩu lần đầu</h1>
      <p class="fpc-sub">
        Admin đã giao bạn mật khẩu mặc định. Vì lý do bảo mật, bạn cần đổi sang
        mật khẩu riêng trước khi sử dụng CRM.
      </p>

      <form @submit.prevent="handleSubmit" class="fpc-form">
        <label class="fpc-label">Mật khẩu admin giao</label>
        <input
          v-model="currentPassword"
          type="password"
          class="fpc-input"
          placeholder="••••••••"
          autocomplete="current-password"
          required
        />

        <label class="fpc-label">Mật khẩu mới</label>
        <input
          v-model="newPassword"
          type="password"
          class="fpc-input"
          placeholder="••••••••"
          autocomplete="new-password"
          required
        />

        <div class="fpc-strength" v-if="newPassword">
          <div class="fpc-strength-row" :class="{ ok: hasLength }">
            <span class="fpc-check">{{ hasLength ? '✓' : '○' }}</span>
            Tối thiểu 8 ký tự
          </div>
          <div class="fpc-strength-row" :class="{ ok: hasUpper }">
            <span class="fpc-check">{{ hasUpper ? '✓' : '○' }}</span>
            Có ít nhất 1 chữ HOA
          </div>
          <div class="fpc-strength-row" :class="{ ok: hasLower }">
            <span class="fpc-check">{{ hasLower ? '✓' : '○' }}</span>
            Có ít nhất 1 chữ thường
          </div>
          <div class="fpc-strength-row" :class="{ ok: hasDigit }">
            <span class="fpc-check">{{ hasDigit ? '✓' : '○' }}</span>
            Có ít nhất 1 chữ số
          </div>
        </div>

        <label class="fpc-label">Nhập lại mật khẩu mới</label>
        <input
          v-model="confirmPassword"
          type="password"
          class="fpc-input"
          :class="{ 'fpc-input-error': confirmPassword && confirmPassword !== newPassword }"
          placeholder="••••••••"
          autocomplete="new-password"
          required
        />
        <div v-if="confirmPassword && confirmPassword !== newPassword" class="fpc-mismatch">
          ⚠ Mật khẩu nhập lại không khớp
        </div>

        <div v-if="error" class="fpc-error">⚠ {{ error }}</div>

        <button
          type="submit"
          class="fpc-submit"
          :disabled="!canSubmit || submitting"
        >
          <span v-if="submitting">⏳ Đang đổi mật khẩu...</span>
          <span v-else>Đổi mật khẩu →</span>
        </button>

        <p class="fpc-note">
          💡 Sau khi đổi, bạn sẽ được đăng xuất và cần login lại với mật khẩu mới.
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const error = ref('');

const hasLength = computed(() => newPassword.value.length >= 8);
const hasUpper = computed(() => /[A-Z]/.test(newPassword.value));
const hasLower = computed(() => /[a-z]/.test(newPassword.value));
const hasDigit = computed(() => /\d/.test(newPassword.value));
const allValid = computed(() => hasLength.value && hasUpper.value && hasLower.value && hasDigit.value);
const canSubmit = computed(() =>
  currentPassword.value && allValid.value && newPassword.value === confirmPassword.value,
);

async function handleSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await api.post('/me/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    // Logout (clear JWT cũ đã bị revoke) + redirect login
    auth.logout();
    router.push('/login?password-changed=1');
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Đổi mật khẩu thất bại';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.fpc-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 50%, #BFDBFE 100%);
  padding: 20px;
}

.fpc-card {
  background: white;
  border-radius: 18px;
  padding: 36px 40px;
  max-width: 460px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(30, 64, 175, 0.18);
}

.fpc-icon {
  width: 68px;
  height: 68px;
  background: linear-gradient(135deg, #FEF3C7 0%, #FCD34D 100%);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  margin: 0 auto 16px;
}

.fpc-title {
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: #0F172A;
  margin: 0 0 8px;
}

.fpc-sub {
  text-align: center;
  color: #64748B;
  font-size: 13.5px;
  line-height: 1.5;
  margin: 0 0 24px;
}

.fpc-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fpc-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  margin-top: 8px;
}

.fpc-input {
  padding: 11px 14px;
  border: 2px solid #E5E7EB;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.fpc-input:focus {
  border-color: #5E6AD2;
}
.fpc-input-error {
  border-color: #EF4444;
}

.fpc-strength {
  background: #F9FAFB;
  padding: 10px 14px;
  border-radius: 8px;
  margin: 4px 0;
}
.fpc-strength-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: #9CA3AF;
  padding: 2px 0;
}
.fpc-strength-row.ok {
  color: #059669;
}
.fpc-check {
  font-weight: 700;
  width: 16px;
}

.fpc-mismatch {
  font-size: 12px;
  color: #DC2626;
}

.fpc-error {
  background: #FEF2F2;
  color: #B91C1C;
  border: 1px solid #FCA5A5;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 6px;
}

.fpc-submit {
  margin-top: 14px;
  background: #5E6AD2;
  color: white;
  border: none;
  padding: 13px 24px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.fpc-submit:hover:not(:disabled) {
  background: #4F46E5;
}
.fpc-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fpc-note {
  text-align: center;
  font-size: 11.5px;
  color: #6B7280;
  font-style: italic;
  margin: 12px 0 0;
}
</style>
