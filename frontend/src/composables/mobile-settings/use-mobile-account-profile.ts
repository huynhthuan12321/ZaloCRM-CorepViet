// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Sửa tên / ảnh đại diện trên mobile. GIỮ NGUYÊN hợp đồng của PersonalAccountPage (desktop): PATCH /me/profile {fullName|avatarUrl:null},
 * POST /me/avatar (multipart, field `avatar`), tên 2–80 ký tự, ảnh ≤15MB, authStore.updateProfile. Chỉ là nơi gọi cho giao diện mobile;
 * nếu desktop đổi quy tắc, đổi cả ở đây (gợi ý dài hạn: tách chung — cần LOCK views/settings).
 */
import { computed, ref } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { apiErrorMessage } from './load-state';

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const AVATAR_MAX_BYTES = 15 * 1024 * 1024;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export function validateFullName(raw: string): string {
  const n = raw.trim().length;
  if (n < NAME_MIN) return `Họ tên tối thiểu ${NAME_MIN} ký tự`;
  if (n > NAME_MAX) return `Họ tên tối đa ${NAME_MAX} ký tự`;
  return '';
}

export function useMobileAccountProfile() {
  const auth = useAuthStore();
  const toast = useToast();
  const saving = ref(false);
  const avatarBusy = ref(false);
  const error = ref('');
  const busy = computed(() => saving.value || avatarBusy.value);

  async function saveName(raw: string): Promise<boolean> {
    const problem = validateFullName(raw);
    if (problem) { error.value = problem; return false; }
    saving.value = true;
    error.value = '';
    try {
      const { data } = await api.patch('/me/profile', { fullName: raw.trim() });
      auth.updateProfile({ fullName: data.fullName });
      toast.success('Đã cập nhật họ tên');
      return true;
    } catch (err) {
      error.value = apiErrorMessage(err, 'Không thể cập nhật họ tên');
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function uploadAvatar(file: File): Promise<boolean> {
    if (file.size > AVATAR_MAX_BYTES) { toast.error('Ảnh tối đa 15MB'); return false; }
    avatarBusy.value = true;
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const { data } = await api.post('/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      auth.updateProfile({ avatarUrl: data.avatarUrl });
      toast.success('Đã cập nhật ảnh đại diện');
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Không thể tải ảnh lên'));
      return false;
    } finally {
      avatarBusy.value = false;
    }
  }

  async function removeAvatar(): Promise<boolean> {
    avatarBusy.value = true;
    try {
      await api.patch('/me/profile', { avatarUrl: null });
      auth.updateProfile({ avatarUrl: null });
      toast.success('Đã xóa ảnh đại diện');
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Không thể xóa ảnh'));
      return false;
    } finally {
      avatarBusy.value = false;
    }
  }

  return { saving, avatarBusy, busy, error, saveName, uploadAvatar, removeAvatar };
}
