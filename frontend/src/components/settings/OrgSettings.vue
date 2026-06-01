<template>
  <div style="max-width: 560px;">
    <div class="text-h6 mb-4">Thông tin tổ chức</div>

    <v-card variant="outlined" class="pa-4">
      <v-text-field
        v-model="orgName"
        label="Tên tổ chức"
        :disabled="!authStore.isOwner || saving"
        variant="outlined"
        class="mb-3"
      />

      <v-select
        v-model="timezone"
        :items="TIMEZONE_OPTIONS"
        item-title="label"
        item-value="value"
        label="Múi giờ hệ thống"
        :disabled="!authStore.isOwner || saving"
        variant="outlined"
        class="mb-1"
        hint="Mọi thời điểm hiển thị, log, debug và quy đổi tham số đều dùng múi giờ này. Mặc định +07:00 (Việt Nam) — để dễ đọc và đồng nhất bug report."
        persistent-hint
      />

      <v-alert
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3 mb-3"
        icon="mdi-clock-outline"
      >
        Bây giờ tại tổ chức: <strong>{{ previewNow }}</strong>
        <span class="text-medium-emphasis"> (UTC{{ timezone }})</span>
      </v-alert>

      <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
      <v-alert v-if="saved" type="success" density="compact" class="mb-3">Đã lưu thành công</v-alert>

      <v-btn
        v-if="authStore.isOwner"
        color="primary"
        :loading="saving"
        :disabled="!canSave"
        @click="handleSave"
      >
        Lưu
      </v-btn>
      <p v-else class="text-medium-emphasis text-body-2">
        Chỉ chủ sở hữu mới có thể chỉnh sửa thông tin tổ chức.
      </p>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { formatInOrgTz, refreshOrgTimezone } from '@/composables/use-org-timezone';

// Offset cố định, không tự DST. Việt Nam đặt đầu danh sách + chọn mặc định.
const TIMEZONE_OPTIONS = [
  { value: '+07:00', label: 'UTC+7 — Việt Nam / Bangkok / Jakarta (mặc định)' },
  { value: '+08:00', label: 'UTC+8 — Singapore / Hong Kong / Bắc Kinh / Manila' },
  { value: '+09:00', label: 'UTC+9 — Tokyo / Seoul' },
  { value: '+05:30', label: 'UTC+5:30 — Ấn Độ' },
  { value: '+10:00', label: 'UTC+10 — Sydney' },
  { value: '+00:00', label: 'UTC±0 — London / Lisbon' },
  { value: '+01:00', label: 'UTC+1 — Berlin / Paris' },
  { value: '-05:00', label: 'UTC-5 — New York (EST)' },
  { value: '-08:00', label: 'UTC-8 — Los Angeles (PST)' },
];

const authStore = useAuthStore();
const orgName = ref('');
const timezone = ref('+07:00');
const original = ref({ name: '', timezone: '+07:00' });
const saving = ref(false);
const error = ref('');
const saved = ref(false);


// Tick mỗi giây để preview "Bây giờ tại tổ chức" cập nhật theo offset chọn.
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

const previewNow = computed(() =>
  formatInOrgTz(new Date(nowTick.value), timezone.value, { withSeconds: true }),
);

const canSave = computed(() => {
  if (!orgName.value.trim()) return false;
  return (
    orgName.value.trim() !== original.value.name || timezone.value !== original.value.timezone
  );
});

async function fetchOrg() {
  try {
    const res = await api.get('/organization');
    orgName.value = res.data.name ?? '';
    timezone.value = res.data.timezone ?? '+07:00';
    original.value = {
      name: orgName.value,
      timezone: timezone.value,
    };
  } catch {
    // endpoint có thể chưa tồn tại lần đầu — giữ default +07:00
  }
}


async function handleSave() {
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    const res = await api.put('/organization', {
      name: orgName.value.trim(),
      timezone: timezone.value,
    });
    original.value = {
      name: res.data.name ?? orgName.value,
      timezone: res.data.timezone ?? timezone.value,
    };
    // Cập nhật cache offset toàn app + auth store để các component khác đổi format luôn.
    refreshOrgTimezone(original.value.timezone);
    if (authStore.user) authStore.user.orgTimezone = original.value.timezone;
    saved.value = true;
    setTimeout(() => {
      saved.value = false;
    }, 3000);
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Lỗi lưu thông tin tổ chức';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  fetchOrg();
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>
