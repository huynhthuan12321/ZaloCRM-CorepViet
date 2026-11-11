<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Tab "Việc của tôi" trên mobile. THỨ TỰ có chủ đích: (1) ĐANG CHỜ TRẢ LỜI là tiêu điểm, (2) lịch hẹn cần làm hôm nay,
  (3) số liệu phụ trợ dạng danh sách (không lưới KPI giống nhau). PrivacySplit giữ tách công khai / riêng tư.
  Lời chào gọn một dòng; nút hành động xuống dòng đủ rộng (không bị cắt). Presenter: không gọi API.
-->
<template>
  <MobileFeedback v-if="state === 'loading' && !me" state="loading" title="Đang tải việc của bạn" />
  <MobileFeedback v-else-if="(state === 'error' || state === 'offline') && !me" :state="state" retryable @retry="emit('retry')" />

  <div v-else-if="me" class="crm-ov">
    <p v-if="state === 'error' || state === 'offline'" class="crm-ov__banner" role="alert">
      {{ state === 'offline' ? 'Đang mất kết nối, số liệu có thể chưa mới.' : 'Không cập nhật được số liệu.' }}
      <button type="button" class="crm-ov__link" @click="emit('retry')">Thử lại</button>
    </p>

    <!-- 1. ĐANG CHỜ TRẢ LỜI -->
    <section class="crm-ov__hero" aria-labelledby="crm-ov-wait">
      <header class="crm-ov__hero-head">
        <h2 id="crm-ov-wait" class="crm-ov__hero-title">Đang chờ trả lời</h2>
        <span class="crm-ov__hero-count"><PrivacyValue :split="me.kpi?.unreplied" label="Đang chờ trả lời" /></span>
      </header>

      <ul v-if="urgent.length" class="crm-ov__wait">
        <li v-for="u in urgent.slice(0, 5)" :key="u.conversationId">
          <button type="button" class="crm-ov__wait-row" @click="emit('openConversation', u.conversationId)">
            <Avatar :src="u.contactAvatar || null" :name="u.contactName" :size="44" :gradient-seed="u.conversationId" />
            <span class="crm-ov__wait-body">
              <span class="crm-ov__wait-top">
                <span class="crm-ov__wait-name"><i v-if="u.isPrivateNick" class="mdi mdi-lock-outline" aria-hidden="true" />{{ u.contactName }}</span>
                <span class="crm-ov__wait-time">{{ agoText(u.lastMessageAt) }}</span>
              </span>
              <span class="crm-ov__wait-preview" :class="{ 'crm-ov__wait-preview--lock': u.redacted }">
                <template v-if="u.redacted"><i class="mdi mdi-lock-outline" aria-hidden="true" /> Nội dung riêng tư</template>
                <template v-else>{{ u.messagePreview || 'Khách vừa nhắn' }}</template>
              </span>
              <span class="crm-ov__wait-meta">
                <span>Nick {{ u.nickName || 'chưa rõ' }}</span>
                <span v-if="urgentStatusLabel(u.status)" class="crm-ov__chip">{{ urgentStatusLabel(u.status) }}</span>
              </span>
            </span>
            <span class="crm-ov__unread" :aria-label="`${u.unreadCount} tin chưa đọc`">{{ u.unreadCount > 99 ? '99+' : u.unreadCount }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="crm-ov__calm"><i class="mdi mdi-check-circle-outline" aria-hidden="true" /> Không có khách nào đang chờ bạn trả lời.</p>

      <button type="button" class="crm-ov__cta" @click="emit('openInbox', 'unreplied')">
        <i class="mdi mdi-message-text-outline" aria-hidden="true" />Vào hội thoại chưa trả lời
      </button>
      <button v-if="urgent.length > 5" type="button" class="crm-ov__more" @click="emit('openInbox', 'unreplied')">Xem thêm {{ urgent.length - 5 }} khách khác</button>
    </section>

    <!-- 2. LỊCH HẸN HÔM NAY -->
    <section class="crm-ov__card" aria-labelledby="crm-ov-appt">
      <header class="crm-ov__card-head">
        <h2 id="crm-ov-appt" class="crm-ov__h">Lịch hẹn cần làm</h2>
        <span class="crm-ov__h-sub"><PrivacyValue :split="me.kpi?.todayAppointments" label="Hẹn hôm nay" /> hôm nay</span>
      </header>
      <ul v-if="agenda.length" class="crm-ov__agenda">
        <li v-for="a in agenda" :key="a.key">
          <button type="button" class="crm-ov__appt" @click="emit('openAppointment', a.id)">
            <span class="crm-ov__appt-time">{{ a.time }}</span>
            <span class="crm-ov__appt-body">
              <span class="crm-ov__appt-title">{{ a.title }}</span>
              <span class="crm-ov__appt-sub">{{ a.sub }}</span>
            </span>
            <span v-if="a.overdue" class="crm-ov__flag">Quá hạn</span>
          </button>
        </li>
      </ul>
      <p v-else class="crm-ov__calm">Không có lịch hẹn nào cần làm hôm nay.</p>
      <p v-if="tomorrowNote" class="crm-ov__note">{{ tomorrowNote }}</p>
    </section>

    <!-- 3. SỐ LIỆU PHỤ TRỢ -->
    <section class="crm-ov__card" aria-labelledby="crm-ov-stats">
      <header class="crm-ov__card-head">
        <h2 id="crm-ov-stats" class="crm-ov__h">Số liệu của bạn</h2>
        <button v-if="showLeadPool" type="button" class="crm-ov__link crm-ov__link--btn" @click="emit('openLeadPool')">Nhận khách</button>
      </header>
      <dl class="crm-ov__stats">
        <div><dt>Khách của tôi</dt><dd>{{ me.kpi?.totalContacts ?? '—' }}</dd></div>
        <div><dt>Khách đình trệ (&gt;7 ngày)</dt><dd><PrivacyValue :split="me.kpi?.dormantContacts" label="Khách đình trệ" /></dd></div>
        <div><dt>Phiên đang theo dõi</dt><dd>{{ me.sessions?.active ?? me.kpi?.followSessions ?? '—' }}</dd></div>
        <div><dt>Chốt tháng này</dt><dd>{{ me.kpi?.closedThisMonth ?? '—' }}</dd></div>
        <div v-if="me.interactionToday"><dt>Tỷ lệ phản hồi hôm nay</dt><dd>{{ me.interactionToday.replyRate }}%</dd></div>
        <div v-if="me.interactionToday"><dt>Lead mới hôm nay</dt><dd>{{ me.interactionToday.newLeads }}</dd></div>
      </dl>
      <button type="button" class="crm-ov__more" @click="emit('openContacts')">Mở danh sách khách hàng</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Avatar from '@/components/ui/Avatar.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import PrivacyValue from './PrivacyValue.vue';
import { agoText, reminderTime, urgentStatusLabel } from './crm-model';
import type { MobileOverviewEmits, MobileOverviewProps } from './types';

const props = withDefaults(defineProps<MobileOverviewProps & { showLeadPool?: boolean }>(), { showLeadPool: false });
const emit = defineEmits<MobileOverviewEmits & { openContacts: []; openLeadPool: [] }>();

interface AgendaRow { key: string; id: string; time: string; title: string; sub: string; overdue: boolean }

const agenda = computed<AgendaRow[]>(() => {
  const me = props.me;
  if (!me) return [];
  const r = me.reminders;
  const toRow = (a: { id: string; title: string | null; appointmentDate: string; appointmentTime: string | null; location: string | null; contactName?: string | null }, overdue: boolean): AgendaRow => ({
    key: `${overdue ? 'ov' : 'td'}-${a.id}`,
    id: a.id,
    time: reminderTime(a.appointmentDate, a.appointmentTime),
    title: a.contactName || a.title || 'Lịch hẹn',
    sub: [a.title && a.contactName ? a.title : '', a.location || ''].filter(Boolean).join(' · ') || 'Không rõ địa điểm',
    overdue,
  });
  if (r) return [...r.overdue.map(a => toRow(a, true)), ...r.today.map(a => toRow(a, false))];
  return (me.appointments ?? []).map(a => toRow(a, false)); // backend cũ chưa có reminders
});

const tomorrowNote = computed(() => {
  const r = props.me?.reminders;
  if (!r) return '';
  const parts: string[] = [];
  if (r.tomorrow.length) parts.push(`Ngày mai: ${r.tomorrow.length} lịch hẹn`);
  if (r.birthdays.length) parts.push(`Sinh nhật hôm nay: ${r.birthdays.length} khách`);
  return parts.join(' · ');
});
</script>

<style scoped>
.crm-ov { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-3) var(--m-gutter) var(--m-space-8); }
.crm-ov__banner { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); padding: var(--m-space-2) var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-size: var(--m-font-meta); font-weight: 600; }
.crm-ov__hero { border: 1px solid var(--m-brand); border-radius: var(--m-radius-card); background: var(--m-surface); padding: var(--m-space-4); display: flex; flex-direction: column; gap: var(--m-space-3); box-shadow: var(--m-shadow-rest); }
.crm-ov__hero-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--m-space-3); }
.crm-ov__hero-title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 700; letter-spacing: -0.2px; }
.crm-ov__hero-count { font-size: 32px; line-height: 1; font-weight: 700; color: var(--m-brand-strong); }
.crm-ov__wait { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.crm-ov__wait-row { display: flex; align-items: flex-start; gap: var(--m-space-3); width: 100%; min-height: 64px; padding: var(--m-space-3) 0; border: 0; border-top: 1px solid var(--m-line); background: transparent; color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; }
.crm-ov__wait-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crm-ov__wait-top { display: flex; justify-content: space-between; gap: var(--m-space-2); }
.crm-ov__wait-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
.crm-ov__wait-time { flex: none; font-size: 12px; color: var(--m-muted); }
.crm-ov__wait-preview { font-size: var(--m-font-meta); color: var(--m-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crm-ov__wait-preview--lock { color: var(--m-muted); }
.crm-ov__wait-meta { display: flex; flex-wrap: wrap; gap: 2px var(--m-space-2); font-size: 12px; color: var(--m-muted); }
.crm-ov__chip { padding: 0 8px; border-radius: 999px; background: var(--m-surface-inset); font-weight: 650; }
.crm-ov__unread { flex: none; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 999px; background: var(--m-brand-strong); color: var(--m-on-action); font-size: 13px; font-weight: 700; line-height: 24px; text-align: center; font-variant-numeric: tabular-nums; }
.crm-ov__cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 48px; border: 0; border-radius: var(--m-radius-md); background: var(--m-brand-strong); color: var(--m-on-action); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-ov__more { width: 100%; min-height: var(--m-touch); border: 0; background: transparent; color: var(--m-brand-strong); font: inherit; font-weight: 650; cursor: pointer; }
.crm-ov__calm { margin: 0; display: flex; gap: 8px; align-items: center; color: var(--m-muted); font-size: var(--m-font-meta); }
.crm-ov__calm .mdi { color: var(--m-success); font-size: 20px; }
.crm-ov__card { border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); padding: var(--m-space-4); display: flex; flex-direction: column; gap: var(--m-space-3); }
.crm-ov__card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); }
.crm-ov__h { margin: 0; font-size: var(--m-font-section); font-weight: 650; }
.crm-ov__h-sub { font-size: var(--m-font-meta); color: var(--m-muted); display: inline-flex; gap: 4px; align-items: baseline; }
.crm-ov__agenda { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.crm-ov__appt { display: flex; align-items: center; gap: var(--m-space-3); width: 100%; min-height: 56px; padding: var(--m-space-2) 0; border: 0; border-top: 1px solid var(--m-line); background: transparent; color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; }
.crm-ov__appt-time { flex: none; width: 52px; font-weight: 700; font-variant-numeric: tabular-nums; }
.crm-ov__appt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.crm-ov__appt-title { font-weight: 650; overflow-wrap: anywhere; }
.crm-ov__appt-sub { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.crm-ov__flag { flex: none; padding: 0 8px; border-radius: 999px; background: var(--m-warning-soft); color: var(--m-warning); font-size: 12px; font-weight: 700; }
.crm-ov__note { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-ov__stats { margin: 0; display: flex; flex-direction: column; }
.crm-ov__stats > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--m-space-3); padding: var(--m-space-2) 0; border-top: 1px solid var(--m-line); }
.crm-ov__stats dt { color: var(--m-muted); font-size: var(--m-font-meta); }
.crm-ov__stats dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.crm-ov__link { border: 0; background: none; color: inherit; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
.crm-ov__link--btn { min-height: var(--m-touch); padding: 0 var(--m-space-2); color: var(--m-brand-strong); text-decoration: none; }
.crm-ov__cta:focus-visible, .crm-ov__more:focus-visible, .crm-ov__link:focus-visible, .crm-ov__wait-row:focus-visible, .crm-ov__appt:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
