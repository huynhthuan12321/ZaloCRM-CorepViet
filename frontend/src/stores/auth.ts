import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { refreshOrgTimezone } from '@/composables/use-org-timezone';

interface User {
  id: string;
  email: string | null;
  phone?: string | null;
  fullName: string;
  role: string;
  orgId: string;
  orgName: string;
  orgTimezone?: string;
  // Phase Onboarding v1 2026-05-24 — track first-run setup state.
  // passwordChangedAt = null → force change pw (router guard redirect /setup-password)
  passwordChangedAt?: string | null;
  onboardingDismissedAt?: string | null;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref(localStorage.getItem('token') || '');
  const needsSetup = ref(false);

  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isOwner = computed(() => user.value?.role === 'owner');
  const isAdmin = computed(() => ['owner', 'admin'].includes(user.value?.role || ''));

  async function checkSetup() {
    const res = await api.get('/setup/status');
    needsSetup.value = res.data.needsSetup;
    return res.data.needsSetup;
  }

  async function setup(data: { orgName: string; fullName: string; email: string; password: string }) {
    const res = await api.post('/setup', data);
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('token', res.data.token);
  }

  // Phase Onboarding v1 2026-05-24 — identifier accept cả email vừa phone
  async function login(identifier: string, password: string) {
    // BE expect field 'email' nhưng accept cả phone — gửi raw identifier qua field email
    // để backward-compat (BE auto-detect '@' hoặc digit-only).
    const res = await api.post('/auth/login', { email: identifier, password });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('token', res.data.token);
  }

  async function fetchProfile() {
    try {
      const res = await api.get('/profile');
      const data = res.data;
      const tz = data.org?.timezone ?? '+07:00';
      user.value = {
        id: data.id,
        email: data.email,
        phone: data.phone ?? null,
        fullName: data.fullName,
        role: data.role,
        orgId: data.orgId,
        orgName: data.org?.name ?? '',
        orgTimezone: tz,
        passwordChangedAt: data.passwordChangedAt ?? null,
        onboardingDismissedAt: data.onboardingDismissedAt ?? null,
      };
      refreshOrgTimezone(tz);
    } catch {
      logout();
    }
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
  }

  async function init() {
    if (token.value) {
      await fetchProfile();
    }
  }

  return { user, token, needsSetup, isAuthenticated, isOwner, isAdmin, checkSetup, setup, login, fetchProfile, logout, init };
});
