<!--
  PrivacyNicksTab — Tab phụ trong /settings/channels/zalo cho user quản lý
  privacy mode của nick mình OWN. Phase Privacy v2 2026-05-23.

  Mục tiêu:
   - User thấy chỉ nicks mình owner, chia 2 nhóm: Riêng tư / Thường
   - Toggle thủ công sang Riêng tư (hard cap maxPrivacyNicks, BE reject 400)
   - Pick 1 nick làm "Nick liên lạc nội bộ" — receiver cho system notification
   - Counter hiển thị (N/max) — red khi đầy
-->
<template>
  <div class="privacy-tab">
    <header class="ptab-head">
      <div>
        <h2 class="ptab-title">Nick Riêng tư của tôi</h2>
        <p class="ptab-sub">
          Default mọi nick là "Thường". Toggle sang "Riêng tư" → admin + sale khác sẽ thấy
          content bị làm mờ. Chỉ bạn unlock được bằng PIN.
        </p>
      </div>
      <div class="ptab-counter" :class="{ full: privateCount >= maxPrivacyNicks }">
        <div class="counter-label">Đã dùng</div>
        <div class="counter-value">{{ privateCount }} / {{ maxPrivacyNicks }}</div>
      </div>
    </header>

    <!-- Empty state khi sale chưa own nick nào -->
    <div v-if="!loading && nicks.length === 0" class="ptab-empty">
      <div class="empty-icon">📱</div>
      <h3>Chưa có nick chính</h3>
      <p>
        Bạn chưa được gán làm chính chủ nick nào. Yêu cầu admin assign owner một nick
        hoặc tự đăng ký nick mới qua QR.
      </p>
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading" class="ptab-loading">
      <div class="skel" v-for="i in 3" :key="i"></div>
    </div>

    <!-- 2 nhóm: Riêng tư / Thường -->
    <template v-else>
      <section v-if="privateNicks.length > 0" class="ptab-group">
        <div class="group-header">
          <span class="group-icon">🔒</span>
          <span class="group-name">Nick Riêng tư</span>
          <span class="group-count">{{ privateNicks.length }}</span>
        </div>
        <div class="nick-list">
          <NickRow
            v-for="n in privateNicks"
            :key="n.id"
            :nick="n"
            :is-internal-contact="internalContactId === n.id"
            :submitting="submittingId === n.id"
            @toggle="onToggle(n)"
            @set-internal="onSetInternalContact(n)"
          />
        </div>
      </section>

      <section v-if="normalNicks.length > 0" class="ptab-group">
        <div class="group-header">
          <span class="group-icon">📭</span>
          <span class="group-name">Nick Thường</span>
          <span class="group-count">{{ normalNicks.length }}</span>
        </div>
        <div class="nick-list">
          <NickRow
            v-for="n in normalNicks"
            :key="n.id"
            :nick="n"
            :is-internal-contact="internalContactId === n.id"
            :submitting="submittingId === n.id"
            @toggle="onToggle(n)"
            @set-internal="onSetInternalContact(n)"
          />
        </div>
      </section>
    </template>

    <!-- Error toast inline -->
    <div v-if="errorMsg" class="ptab-error" @click="errorMsg = ''">
      ⚠ {{ errorMsg }} <span class="dismiss">✕</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, defineComponent } from 'vue';
import { api } from '@/api/index';

interface MyNick {
  id: string;
  zaloUid: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  privacyMode: 'main' | 'sub';
}

const nicks = ref<MyNick[]>([]);
const loading = ref(true);
const submittingId = ref<string | null>(null);
const errorMsg = ref('');
const maxPrivacyNicks = ref(2);
const internalContactId = ref<string | null>(null);

const privateNicks = computed(() => nicks.value.filter((n) => n.privacyMode === 'main'));
const normalNicks = computed(() => nicks.value.filter((n) => n.privacyMode !== 'main'));
const privateCount = computed(() => privateNicks.value.length);

async function loadAll() {
  loading.value = true;
  try {
    const [myNicks, meContact] = await Promise.all([
      api.get<MyNick[]>('/privacy/my-nicks'),
      api.get<{ internalContactZaloAccountId: string | null; maxPrivacyNicks: number }>('/me/internal-contact'),
    ]);
    nicks.value = myNicks.data;
    internalContactId.value = meContact.data.internalContactZaloAccountId;
    maxPrivacyNicks.value = meContact.data.maxPrivacyNicks;
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Không tải được danh sách nick';
  } finally {
    loading.value = false;
  }
}

async function onToggle(nick: MyNick) {
  if (submittingId.value) return;
  const newMode: 'main' | 'sub' = nick.privacyMode === 'main' ? 'sub' : 'main';
  submittingId.value = nick.id;
  errorMsg.value = '';
  try {
    await api.patch(`/zalo-accounts/${nick.id}/privacy-mode`, { mode: newMode });
    nick.privacyMode = newMode;
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Đổi privacy mode thất bại';
  } finally {
    submittingId.value = null;
  }
}

async function onSetInternalContact(nick: MyNick) {
  if (submittingId.value) return;
  const newValue = internalContactId.value === nick.id ? null : nick.id;
  submittingId.value = nick.id;
  errorMsg.value = '';
  try {
    await api.patch('/me/internal-contact', { zaloAccountId: newValue });
    internalContactId.value = newValue;
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Đặt nick liên lạc nội bộ thất bại';
  } finally {
    submittingId.value = null;
  }
}

onMounted(loadAll);

// Inline NickRow component (vì chỉ dùng nội bộ tab này)
const NickRow = defineComponent({
  props: {
    nick: { type: Object as () => MyNick, required: true },
    isInternalContact: { type: Boolean, default: false },
    submitting: { type: Boolean, default: false },
  },
  emits: ['toggle', 'set-internal'],
  setup(props, { emit }) {
    const initials = (name: string | null) => {
      if (!name) return '?';
      const parts = name.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };
    const avatarColor = (name: string | null) => {
      const palette = [
        'linear-gradient(135deg,#f59e0b,#ef4444)',
        'linear-gradient(135deg,#3b82f6,#1e40af)',
        'linear-gradient(135deg,#10b981,#059669)',
        'linear-gradient(135deg,#8b5cf6,#6d28d9)',
      ];
      const h = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return palette[h % palette.length];
    };
    const statusLabel = (s: string) =>
      s === 'connected' ? { label: 'Đang kết nối', color: '#10B981' }
        : s === 'qr_pending' ? { label: 'Cần đăng nhập', color: '#F59E0B' }
          : { label: 'Đứt kết nối', color: '#EF4444' };

    return () => {
      const n = props.nick;
      const isMain = n.privacyMode === 'main';
      const stat = statusLabel(n.status);
      return h('div', { class: 'nick-row' }, [
        h('div', { class: 'nr-avatar', style: { background: avatarColor(n.displayName) } }, [
          n.avatarUrl
            ? h('img', { src: n.avatarUrl })
            : initials(n.displayName),
        ]),
        h('div', { class: 'nr-info' }, [
          h('div', { class: 'nr-name' }, [
            n.displayName || 'Nick chưa đặt tên',
            props.isInternalContact ? h('span', { class: 'nr-badge-internal', title: 'Nick liên lạc nội bộ của bạn' }, '🏠 Liên lạc nội bộ') : null,
          ]),
          h('div', { class: 'nr-meta' }, [
            h('span', { class: 'nr-dot', style: { background: stat.color } }),
            stat.label,
            n.zaloUid ? h('span', { class: 'nr-uid' }, [' · UID ' + n.zaloUid]) : null,
          ]),
          !props.isInternalContact
            ? h('button', {
              class: 'nr-set-internal',
              disabled: props.submitting,
              onClick: () => emit('set-internal'),
            }, '🏠 Đặt làm nick liên lạc nội bộ')
            : h('button', {
              class: 'nr-clear-internal',
              disabled: props.submitting,
              onClick: () => emit('set-internal'),
            }, '✕ Bỏ liên lạc nội bộ'),
        ]),
        h('button', {
          class: ['nr-toggle', isMain ? 'on' : 'off'],
          disabled: props.submitting,
          onClick: () => emit('toggle'),
          title: isMain ? 'Đang Riêng tư — click để chuyển Thường' : 'Đang Thường — click để chuyển Riêng tư',
        }, [
          h('span', { class: 'nr-toggle-track' }, [
            h('span', { class: 'nr-toggle-thumb' }),
          ]),
          h('span', { class: 'nr-toggle-label' }, isMain ? 'Riêng tư' : 'Thường'),
        ]),
      ]);
    };
  },
});
</script>

<style scoped>
.privacy-tab {
  padding: 20px 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ptab-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
  padding-bottom: 12px; border-bottom: 1px solid #E5E7EB;
}
.ptab-title { margin: 0; font-size: 18px; font-weight: 700; color: #0F172A; }
.ptab-sub {
  margin: 6px 0 0; color: #6B7280; font-size: 12.5px; line-height: 1.5; max-width: 640px;
}

.ptab-counter {
  background: #EFF6FF; border: 1px solid #DBEAFE; border-radius: 10px;
  padding: 10px 16px; min-width: 120px; text-align: center;
}
.ptab-counter.full { background: #FEF2F2; border-color: #FECACA; }
.counter-label { font-size: 10.5px; color: #6B7280; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.counter-value { font-size: 20px; font-weight: 700; color: #1D4ED8; font-variant-numeric: tabular-nums; line-height: 1.1; margin-top: 2px; }
.ptab-counter.full .counter-value { color: #B91C1C; }

.ptab-empty {
  background: white; border: 1px dashed #E5E7EB; border-radius: 12px;
  padding: 48px 24px; text-align: center; color: #6B7280;
}
.empty-icon { font-size: 40px; margin-bottom: 12px; }
.ptab-empty h3 { margin: 0 0 6px; font-size: 16px; color: #0F172A; }
.ptab-empty p { margin: 0; font-size: 13px; max-width: 420px; margin: 0 auto; }

.ptab-loading { display: flex; flex-direction: column; gap: 8px; }
.skel { height: 64px; background: linear-gradient(90deg, #F3F4F6 0%, #E5E7EB 50%, #F3F4F6 100%); background-size: 200% 100%; animation: skel 1.5s linear infinite; border-radius: 10px; }
@keyframes skel { from { background-position: 200% 0 } to { background-position: -200% 0 } }

.ptab-group { display: flex; flex-direction: column; gap: 8px; }
.group-header {
  display: flex; align-items: center; gap: 8px; padding: 4px 2px;
  font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: .04em; font-weight: 700;
}
.group-icon { font-size: 14px; }
.group-count {
  background: #F3F4F6; color: #6B7280; font-weight: 700;
  padding: 1px 8px; border-radius: 9999px; font-size: 10px; letter-spacing: 0;
}

.nick-list { display: flex; flex-direction: column; gap: 8px; }

:deep(.nick-row) {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; background: white;
  border: 1px solid #E5E7EB; border-radius: 10px;
  transition: border-color 0.15s;
}
:deep(.nick-row:hover) { border-color: #C7D2FE; }
:deep(.nr-avatar) {
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 700; font-size: 13px; flex-shrink: 0;
  overflow: hidden;
}
:deep(.nr-avatar img) { width: 100%; height: 100%; object-fit: cover; }

:deep(.nr-info) { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
:deep(.nr-name) {
  font-size: 14px; font-weight: 600; color: #0F172A;
  display: flex; align-items: center; gap: 8px;
}
:deep(.nr-badge-internal) {
  background: #FEF3C7; color: #92400E; font-size: 10.5px;
  padding: 2px 8px; border-radius: 9999px; font-weight: 700;
}
:deep(.nr-meta) { font-size: 11.5px; color: #6B7280; display: flex; align-items: center; gap: 4px; }
:deep(.nr-dot) { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
:deep(.nr-uid) { color: #9CA3AF; }

:deep(.nr-set-internal), :deep(.nr-clear-internal) {
  background: transparent; border: 1px dashed #C7D2FE; color: #5E6AD2;
  font-size: 11px; font-weight: 600; padding: 4px 10px;
  border-radius: 6px; cursor: pointer; align-self: flex-start; margin-top: 2px;
  font-family: inherit;
}
:deep(.nr-set-internal):hover, :deep(.nr-clear-internal):hover { background: #EEF0FF; border-style: solid; }
:deep(.nr-clear-internal) { color: #B91C1C; border-color: #FCA5A5; }
:deep(.nr-clear-internal:hover) { background: #FEF2F2; }

:deep(.nr-toggle) {
  display: inline-flex; align-items: center; gap: 8px;
  background: transparent; border: none; cursor: pointer; padding: 4px 0;
  font-family: inherit;
}
:deep(.nr-toggle-track) {
  width: 38px; height: 22px; border-radius: 9999px;
  background: #D1D5DB; position: relative; transition: background 0.15s;
}
:deep(.nr-toggle-thumb) {
  position: absolute; top: 2px; left: 2px;
  width: 18px; height: 18px; border-radius: 50%; background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: transform 0.15s;
}
:deep(.nr-toggle.on .nr-toggle-track) { background: #5E6AD2; }
:deep(.nr-toggle.on .nr-toggle-thumb) { transform: translateX(16px); }
:deep(.nr-toggle-label) {
  font-size: 12px; font-weight: 600; color: #374151;
  min-width: 60px; text-align: left;
}
:deep(.nr-toggle.on .nr-toggle-label) { color: #5E6AD2; }
:deep(.nr-toggle:disabled) { opacity: 0.5; cursor: not-allowed; }

.ptab-error {
  position: fixed; bottom: 24px; right: 24px;
  background: #FEF2F2; color: #B91C1C; border: 1px solid #FCA5A5;
  padding: 12px 18px; border-radius: 10px; font-size: 13px;
  display: flex; align-items: center; gap: 12px; cursor: pointer;
  box-shadow: 0 8px 24px rgba(185, 28, 28, 0.15); z-index: 1000;
  max-width: 480px;
}
.ptab-error .dismiss { color: #DC2626; font-weight: 700; }
</style>
