<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- "Quản lý team" trên mobile (chỉ hiện khi hasTeamSection). Bảng nhân viên desktop -> danh sách thẻ. Lỗi/thiếu section hiện LỖI, không hiện 0. -->
<template>
  <MobileFeedback v-if="loading && !team" state="loading" title="Đang tải số liệu team" />
  <MobileFeedback v-else-if="!team" state="error" title="Không tải được số liệu team" description="Bạn có thể không có quyền xem hoặc kết nối đang lỗi." retryable @retry="emit('retry')" />

  <div v-else class="crm-tm">
    <p class="crm-tm__priv"><i class="mdi mdi-lock-outline" aria-hidden="true" /> Số liệu tách công khai và <i class="mdi mdi-lock-outline" aria-hidden="true" /> riêng tư. Quản lý không xem nội dung tin của nick riêng tư.</p>

    <section class="crm-tm__card" aria-labelledby="crm-tm-sum">
      <h2 id="crm-tm-sum" class="crm-tm__h">Tổng quan team</h2>
      <dl class="crm-tm__dl">
        <div><dt>Tồn đọng chưa trả lời</dt><dd><PrivacyValue :split="team.teamKpi?.unreplied" label="Tồn đọng team" /></dd></div>
        <div><dt>Lịch hẹn hôm nay</dt><dd><PrivacyValue :split="team.teamKpi?.todayAppointments" label="Hẹn team" /></dd></div>
        <div><dt>Phiên đang theo dõi</dt><dd>{{ team.followSessions?.active ?? '—' }}</dd></div>
        <div><dt>Tổng khách hàng</dt><dd>{{ team.teamKpi?.totalContacts ?? '—' }}</dd></div>
        <div><dt>Chốt trong tuần</dt><dd>{{ team.teamKpi?.closedThisWeek ?? '—' }}</dd></div>
        <div v-if="team.topUser"><dt>Nổi bật</dt><dd>{{ firstNameOf(team.topUser.fullName) }} ({{ team.topUser.closedThisWeek }})</dd></div>
      </dl>
    </section>

    <section class="crm-tm__card" aria-labelledby="crm-tm-users">
      <h2 id="crm-tm-users" class="crm-tm__h">Đội ngũ<template v-if="team.perUser"> ({{ team.perUser.length }} nhân viên)</template></h2>
      <ul v-if="team.perUser?.length" class="crm-tm__users">
        <li v-for="u in team.perUser" :key="u.userId" class="crm-tm__user">
          <Avatar :src="u.avatarUrl" :name="u.fullName" :size="40" :gradient-seed="u.userId" />
          <span class="crm-tm__user-main">
            <strong class="crm-tm__user-name">{{ u.fullName }}</strong>
            <span class="crm-tm__user-sub">{{ u.departmentName || 'Chưa có phòng' }}</span>
            <span class="crm-tm__user-nums">
              Chưa rep <PrivacyValue :split="u.unreplied" label="Chưa trả lời" /> · Hẹn <PrivacyValue :split="u.todayAppointments" label="Hẹn" /> · Chốt tuần {{ u.closedThisWeek }}
            </span>
          </span>
          <button type="button" class="crm-tm__view" :aria-label="`Xem việc của ${u.fullName}`" @click="emit('viewUser', u.userId)">Xem</button>
        </li>
      </ul>
      <p v-else class="crm-tm__empty">Chưa có nhân viên nào trong phạm vi của bạn.</p>
    </section>

    <section class="crm-tm__card" aria-labelledby="crm-tm-pool">
      <h2 id="crm-tm-pool" class="crm-tm__h">Nhận khách &amp; phản hồi</h2>
      <dl class="crm-tm__dl">
        <div><dt>Lead đang chờ nhận</dt><dd>{{ team.leadPool?.pending ?? '—' }}</dd></div>
        <div><dt>Đã nhận hôm nay</dt><dd>{{ team.leadPool?.claimedToday ?? '—' }}</dd></div>
        <div><dt>Khách bị bỏ quên</dt><dd>{{ team.leadPool?.forgotten ?? '—' }}</dd></div>
        <div><dt>Tỷ lệ phản hồi hôm nay</dt><dd>{{ team.responsePerf ? `${team.responsePerf.replyRate}%` : '—' }}</dd></div>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
import Avatar from '@/components/ui/Avatar.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import type { TeamResponse } from '@/composables/use-dashboard-action-hub';
import PrivacyValue from './PrivacyValue.vue';
import { firstNameOf } from './crm-model';

defineProps<{ team: TeamResponse | null; loading: boolean }>();
const emit = defineEmits<{ retry: []; viewUser: [userId: string] }>();
</script>

<style scoped>
.crm-tm { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-3) var(--m-gutter) var(--m-space-8); }
.crm-tm__priv { margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-size: var(--m-font-meta); font-weight: 600; }
.crm-tm__card { border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); padding: var(--m-space-4); display: flex; flex-direction: column; gap: var(--m-space-3); }
.crm-tm__h { margin: 0; font-size: var(--m-font-section); font-weight: 650; }
.crm-tm__dl { margin: 0; display: flex; flex-direction: column; }
.crm-tm__dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--m-space-3); padding: var(--m-space-2) 0; border-top: 1px solid var(--m-line); }
.crm-tm__dl dt { color: var(--m-muted); font-size: var(--m-font-meta); }
.crm-tm__dl dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.crm-tm__users { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.crm-tm__user { display: flex; align-items: center; gap: var(--m-space-3); padding: var(--m-space-3) 0; border-top: 1px solid var(--m-line); }
.crm-tm__user-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crm-tm__user-name { overflow-wrap: anywhere; }
.crm-tm__user-sub, .crm-tm__user-nums { font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-tm__user-nums { display: flex; flex-wrap: wrap; gap: 2px 6px; align-items: baseline; }
.crm-tm__view { flex: none; min-width: var(--m-touch); min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-brand-strong); font: inherit; font-weight: 650; cursor: pointer; }
.crm-tm__view:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-tm__empty { margin: 0; color: var(--m-muted); font-size: var(--m-font-meta); }
</style>
