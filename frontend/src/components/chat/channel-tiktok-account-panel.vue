<template>
  <div class="tiktok-login-container">
    <!-- Header -->
    <div class="login-header">
      <h2>Ðang nh?p TikTok</h2>
      <p class="subtitle">Nh?p thông tin tài kho?n TikTok c?a b?n</p>
    </div>

    <!-- Error Messages -->
    <div v-if="errorMessage" class="error-alert">
      <span class="error-icon">??</span>
      <span>{{ errorMessage }}</span>
      <button @click="errorMessage = ''" class="error-close">×</button>
    </div>

    <!-- Login Form -->
    <form @submit.prevent="handleLogin" class="login-form">
      <!-- Username Input -->
      <div class="form-group">
        <label>Tài kho?n / Email / S? di?n tho?i</label>
        <div class="input-wrapper">
          <input
            v-model="credentials.username"
            type="text"
            placeholder="Nh?p username ho?c email"
            class="form-input"
            :disabled="isLoading || showOtpInput"
            required
          />
          <span class="input-icon">??</span>
        </div>
      </div>

      <!-- Password Input -->
      <div class="form-group">
        <label>M?t kh?u</label>
        <div class="input-wrapper">
          <input
            v-model="credentials.password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Nh?p m?t kh?u"
            class="form-input"
            :disabled="isLoading || showOtpInput"
            required
          />
          <button
            type="button"
            @click="showPassword = !showPassword"
            class="input-icon-btn"
          >
            {{ showPassword ? '???' : '???????' }}
          </button>
        </div>
      </div>

      <!-- OTP Input (Conditional) -->
      <div v-if="showOtpInput" class="form-group otp-group">
        <label>Mã xác minh (OTP)</label>
        <p class="otp-hint">Mã 6 ch? s? du?c g?i t?i email c?a b?n</p>
        <div class="otp-input-wrapper">
          <input
            v-model="otpCode"
            type="text"
            placeholder="Nh?p 6 ch? s?"
            maxlength="6"
            pattern="\d{6}"
            class="otp-input"
            @input="otpCode = otpCode.replace(/\D/g, '').slice(0, 6)"
          />
          <span class="otp-icon">??</span>
        </div>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="btn-submit"
        :disabled="isLoading || (showOtpInput && otpCode.length !== 6)"
      >
        <span v-if="!isLoading">
          {{ showOtpInput ? 'Xác minh OTP' : 'Ðang nh?p' }}
        </span>
        <span v-else class="loading-spinner">?</span>
      </button>
    </form>

    <!-- Action Buttons -->
    <div class="action-buttons">
      <button
        @click="refreshStatus"
        class="btn-secondary"
        :disabled="isLoading"
      >
        ?? Làm m?i tr?ng thái
      </button>
      <button
        @click="clearHistory"
        class="btn-danger"
        :disabled="isLoading"
      >
        ??? Xóa l?ch s?
      </button>
    </div>

    <!-- Account Info -->
    <div v-if="accountInfo" class="account-info">
      <p><strong>Tài kho?n:</strong> {{ accountInfo.username }}</p>
      <p><strong>ID:</strong> {{ accountInfo.accountId }}</p>
      <p><strong>Epoch:</strong> {{ accountInfo.epoch }}</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TikTokLogin',
  data() {
    return {
      credentials: ***
        username: '',
        password: '',
      },
      otpCode: '',
      showPassword: ***
      showOtpInput: false,
      isLoading: false,
      errorMessage: '',
      accountInfo: null,
      attemptCount: 0,
      maxAttempts: 5,
    };
  },
  methods: {
    async handleLogin() {
      if (this.showOtpInput) {
        await this.verifyOtp();
      } else {
await this.submitPassword();
      }
    },
    async submitPassword() {
      if (!this.credentials.username || !this.credentials.password) {
        this.errorMessage = 'Vui lòng nh?p tài kho?n và m?t kh?u';
        return;
      }

      this.isLoading = true;
      this.errorMessage = '';

      try {
        // Call worker API to submit password
        const response = await fetch('/api/tiktok/login/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.credentials.username,
            password: this.c...ord,
          }),
        });

        const result = await response.json();

        if (result.requiresOtp) {
          // TikTok ??????? OTP
          this.showOtpInput = true;
          this.errorMessage = '';
        } else if (result.success) {
          // Login ??????? - ????????? ??????? ? ??
          await this.saveAccountToDb(result.accountData);
          this.$emit('login-success', result.accountData);
        } else {
          this.attemptCount++;
          const attemptsLeft = this.maxAttempts - this.attemptCount;
          this.errorMessage = `${result.message || 'Ðang nh?p th?t b?i'}. Còn ${attemptsLeft} l?n nh?p.`;

          if (this.attemptCount >= this.maxAttempts) {
            this.errorMessage = 'Quá nhi?u l?n nh?p sai. Vui lòng th? l?i sau.';
            this.credentials.password = '';
          }
        }
      } catch (error) {
        this.errorMessage = `L?i: ${error.message}`;
      } finally {
        this.isLoading = false;
      }
    },
    async verifyOtp() {
      if (this.otpCode.length !== 6) {
        this.errorMessage = 'Vui lòng nh?p mã OTP 6 ch? s?';
        return;
      }

      this.isLoading = true;
      this.errorMessage = '';

      try {
        const response = await fetch('/api/tiktok/login/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.credentials.username,
            otpCode: this.otpCode,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // OTP verified - save account to DB
          await this.saveAccountToDb(result.accountData);
          this.$emit('login-success', result.accountData);
          this.resetForm();
        } else {
          this.errorMessage = result.message || 'Mã OTP không chính xác';
          this.otpCode = '';
        }
      } catch (error) {
        this.errorMessage = `L?i xác minh OTP: ${error.message}`;
      } finally {
        this.isLoading = false;
      }
    },
    async saveAccountToDb(accountData) {
      // Save account to CRM database only after successful login
      await fetch('/api/tiktok/account/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData),
      });

      this.accountInfo = accountData;
    },
    async refreshStatus() {
      this.isLoading = true;
      try {
        const response = await fetch('/api/tiktok/status');
        const data = await response.json();
        this.accountInfo = data.account;
      } catch (error) {
        this.errorMessage = `L?i làm m?i: ${error.message}`;
      } finally {
        this.isLoading = false;
      }
    },
    async clearHistory() {
      if (!confirm('B?n ch?c ch?n mu?n xóa l?ch s? dang nh?p?')) return;

      this.isLoading = true;
      try {
        await fetch('/api/tiktok/login/clear-history', { method: 'POST' });
        this.resetForm();
        this.accountInfo = null;
        this.errorMessage = '';
      } catch (error) {
        this.errorMessage = `L?i xóa l?ch s?: ${error.message}`;
      } finally {
        this.isLoading = false;
      }
    },
    resetForm() {
      this.credentials = { username: '', password: '' };
      this.otpCode = '';
      this.showOtpInput = false;
      this.showPassword = false;
      this.attemptCount = 0;
    },
  },
};
</script>

<style scoped>
.tiktok-login-container {
  background: #121212;
  color: #fff;
  padding: 2rem;
  border-radius: 12px;
  max-width: 420px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-header h2 {
  font-size: 1.8rem;
  margin: 0 0 0.5rem 0;
  font-weight: 600;
}

.login-header .subtitle {
  color: #888;
  font-size: 0.9rem;
  margin: 0;
}

.error-alert {
  background: #e74c3c;
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9rem;
}

.error-icon {
  font-size: 1.2rem;
}

.error-close {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1.5rem;
  margin-left: auto;
  padding: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #fff;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.form-input {
  width: 100%;
  background: #222;
  border: 1px solid #333;
  color: #fff;
  padding: 0.75rem 2.5rem 0.75rem 1rem;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: #00f7ef;
  background: #1a1a1a;
}

.form-input:disabled {
  background: #1a1a1a;
  color: #666;
  cursor: not-allowed;
}

.input-icon {
  position: absolute;
  right: 0.75rem;
  font-size: 1.2rem;
  pointer-events: none;
}

.input-icon-btn {
  position: absolute;
  right: 0.75rem;
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0;
  transition: color 0.2s ease;
}

.input-icon-btn:hover {
  color: #00f7ef;
}

.otp-group {
  background: #1a1a1a;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #333;
}

.otp-hint {
  font-size: 0.85rem;
  color: #888;
  margin: 0;
}

.otp-input-wrapper {
  position: relative;
}

.otp-input {
  width: 100%;
  background: #222;
  border: 1px solid #00f7ef;
  color: #fff;
  padding: 0.75rem 2.5rem 0.75rem 1rem;
  border-radius: 8px;
  font-size: 1.1rem;
  letter-spacing: 0.3rem;
  text-align: center;
  font-weight: 600;
}

.otp-input:focus {
  outline: none;
  border-color: #0dd77e;
  background: #1a1a1a;
}

.btn-submit {
  background: linear-gradient(135deg, #00f7ef, #0dd77e);
  color: #000;
  border: none;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 44px;
}

.btn-submit:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-2px);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.btn-secondary,
.btn-danger {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #333;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #1a1a1a;
  color: #fff;
}

.btn-secondary:hover:not(:disabled) {
  border-color: #00f7ef;
  color: #00f7ef;
}

.btn-danger:hover:not(:disabled) {
  border-color: #e74c3c;
  color: #e74c3c;
}

.btn-secondary:disabled,
.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.account-info {
  background: #1a1a1a;
  border: 1px solid #333;
  padding: 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #aaa;
}

.account-info p {
  margin: 0.5rem 0;
}

.account-info strong {
  color: #fff;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .tiktok-login-container {
    padding: 1rem;
    max-width: 100%;
  }

  .login-header h2 {
    font-size: 1.5rem;
  }
}
</style>
