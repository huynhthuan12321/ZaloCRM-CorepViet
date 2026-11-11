<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Hồ sơ khách toàn màn hình. CÙNG THỨ TỰ với desktop (DesktopContactProfileView): Hero (tên, điểm, trạng thái, phụ trách chính)
  -> Thông tin chung -> Nick Zalo -> Tags tổng hợp. Signature: nick + người phụ trách (+N cùng chăm) ngay dưới tên.
  Không bịa trường: chỉ render dữ liệu có trong Contact / ContactProfileResponse. Presenter: không gọi API.
-->
<template>
  <MobileFeedback v-if="state === 'loading'" state="loading" title="Đang tải hồ sơ khách" />
  <MobileFeedback v-else-if="state === 'offline'" state="offline" retryable @retry="emit('retry')" />
  <MobileFeedback v-else-if="state === 'forbidden'" state="forbidden" title="Bạn không có quyền xem khách này" />
  <MobileFeedback v-else-if="state === 'error'" state="error" title="Không tải được hồ sơ khách" retryable @retry="emit('retry')" />
  <MobileFeedback v-else-if="state === 'missing' || !contact" state="empty" title="Khách không tồn tại hoặc đã xóa" retryable @retry="emit('retry')" />

  <article v-else class="crm-profile">
    <section class="crm-profile__hero" aria-labelledby="crm-p-name">
      <Avatar :src="contact.avatarUrl || null" :name="name" :size="64" :gradient-seed="contact.id" />
      <div class="crm-profile__hero-main">
        <h2 id="crm-p-name" class="crm-profile__name">{{ name }}</h2>
        <div class="crm-profile__chips">
          <span class="crm-profile__chip crm-profile__chip--score" :title="'Điểm cao nhất trên các nick'">Điểm {{ score }}</span>
          <span v-if="statusLabel" class="crm-profile__chip crm-profile__chip--status">{{ statusLabel }}</span>
        </div>
        <p class="crm-profile__owner" :class="{ 'crm-profile__owner--none': !ownerName }">
          <i class="mdi mdi-account-outline" aria-hidden="true" />
          <span>Phụ trách chính: <strong>{{ ownerName || 'chưa có' }}</strong><template v-if="owner.extra > 0"> +{{ owner.extra }} người cùng chăm</template></span>
        </p>
        <p class="crm-profile__nickline">
          <i class="mdi mdi-chat-processing-outline" aria-hidden="true" />
          <span>{{ nickLine }}</span>
        </p>
      </div>
    </section>

    <div class="crm-profile__actions" role="group" aria-label="Thao tác với khách">
      <button type="button" class="crm-profile__act crm-profile__act--primary" @click="emit('message', contact.id)">
        <i class="mdi mdi-message-text-outline" aria-hidden="true" />Nhắn tin
      </button>
      <button type="button" class="crm-profile__act" @click="emit('schedule', contact.id)">
        <i class="mdi mdi-calendar-plus" aria-hidden="true" />Đặt lịch
      </button>
      <button v-if="canEdit" type="button" class="crm-profile__act" @click="emit('edit', contact.id)">
        <i class="mdi mdi-pencil-outline" aria-hidden="true" />Sửa
      </button>
      <button type="button" class="crm-profile__act" @click="emit('openActivity', contact.id)">
        <i class="mdi mdi-history" aria-hidden="true" />Nhật ký
      </button>
    </div>

    <section class="crm-profile__card" aria-labelledby="crm-p-general">
      <h3 id="crm-p-general" class="crm-profile__h">Thông tin chung</h3>
      <dl v-if="rows.length" class="crm-profile__dl">
        <div v-for="r in rows" :key="r.label" class="crm-profile__row">
          <dt>{{ r.label }}</dt>
          <dd>{{ r.value }}</dd>
        </div>
      </dl>
      <p v-else class="crm-profile__empty">Chưa có thông tin chi tiết.</p>
    </section>

    <section class="crm-profile__card" aria-labelledby="crm-p-nick">
      <h3 id="crm-p-nick" class="crm-profile__h">Nick Zalo ({{ nickRows.length }})</h3>
      <p v-if="profileMissing" class="crm-profile__note" role="status">Chưa tải được chi tiết nick. Các hội thoại bên dưới vẫn dùng được.</p>
      <ul v-if="nickRows.length" class="crm-profile__nicks">
        <li v-for="n in nickRows" :key="n.key" class="crm-profile__nick">
          <div class="crm-profile__nick-top">
            <strong class="crm-profile__nick-name">{{ n.title }}</strong>
            <span v-if="n.relation" class="crm-profile__chip">{{ n.relation }}</span>
          </div>
          <div v-if="n.account" class="crm-profile__nick-sub">Nick: {{ n.account }}</div>
          <div v-if="n.owner" class="crm-profile__nick-sub">Phụ trách: {{ n.owner }}</div>
          <div v-if="n.stats" class="crm-profile__nick-sub">{{ n.stats }}</div>
        </li>
      </ul>
      <p v-else class="crm-profile__empty">Chưa có nick Zalo nào.</p>
    </section>

    <section class="crm-profile__card" aria-labelledby="crm-p-tags">
      <h3 id="crm-p-tags" class="crm-profile__h">Tags tổng hợp</h3>
      <ul v-if="tags.length" class="crm-profile__tags"><li v-for="t in tags" :key="t" class="crm-profile__tag">{{ t }}</li></ul>
      <p v-else class="crm-profile__empty">Chưa có tag.</p>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Avatar from '@/components/ui/Avatar.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { formatRecentDateTime } from '@/composables/use-contacts';
import type { ContactProfileResponse } from '@/composables/use-contact-profile';
import { contactName, contactOwner, contactStatusLabel, profileGeneralRows, relationLabel } from './crm-model';
import type { CustomerProfileEmits, CustomerProfileProps } from './types';

const props = defineProps<CustomerProfileProps & { profile?: ContactProfileResponse | null; profileMissing?: boolean }>();
const emit = defineEmits<CustomerProfileEmits & { retry: [] }>();

const name = computed(() => (props.profile?.contact.displayName?.trim() || (props.contact ? contactName(props.contact) : '')));
const owner = computed(() => (props.contact ? contactOwner(props.contact) : { name: null, extra: 0 }));
const ownerName = computed(() => props.profile?.primaryOwner?.userName || owner.value.name);
const score = computed(() => Math.round(props.profile?.aggregateScore ?? props.contact?.displayLeadScore ?? props.contact?.leadScore ?? 0));
const statusLabel = computed(() => props.profile?.contact.statusName || (props.contact ? contactStatusLabel(props.contact) : ''));
const rows = computed(() => profileGeneralRows(props.contact));
const tags = computed(() => props.profile?.aggregateTags ?? props.contact?.tags ?? []);

const nickLine = computed(() => {
  const convs = props.conversations;
  if (!convs.length) return 'Chưa có hội thoại nào với khách này';
  const names = convs.map(c => c.nickName);
  const shown = names.slice(0, 2).join(', ');
  return names.length > 2 ? `Nick ${shown} +${names.length - 2}` : `Nick ${shown}`;
});

interface NickRow { key: string; title: string; account: string; owner: string; relation: string; stats: string }
const nickRows = computed<NickRow[]>(() => {
  const friends = props.profile?.friends;
  if (friends?.length) {
    return friends.map(f => ({
      key: f.id,
      title: f.displayName || f.aliasInNick || 'Chưa có tên',
      account: f.accountName || '',
      owner: ownerName.value || '',
      relation: relationLabel(f.relationshipKind),
      stats: `Điểm ${f.leadScore} · Khách gửi ${f.totalInbound} / Sale gửi ${f.totalOutbound}${f.lastInboundAt ? ` · Gần nhất ${formatRecentDateTime(f.lastInboundAt)}` : ''}`,
    }));
  }
  return props.conversations.map(c => ({ key: c.convId, title: c.nickName, account: '', owner: c.ownerName || '', relation: '', stats: '' }));
});
</script>

<style scoped>
.crm-profile { display: flex; flex-direction: column; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-gutter) var(--m-space-8); }
.crm-profile__hero, .crm-profile__card {
  border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); padding: var(--m-space-4);
}
.crm-profile__hero { display: flex; gap: var(--m-space-4); align-items: flex-start; }
.crm-profile__hero-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-profile__name { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 700; letter-spacing: -0.2px; overflow-wrap: anywhere; }
.crm-profile__chips { display: flex; flex-wrap: wrap; gap: var(--m-space-2); }
.crm-profile__chip { padding: 2px 10px; border-radius: 999px; background: var(--m-surface-inset); color: var(--m-muted); font-size: 12px; font-weight: 650; line-height: 1.5; }
.crm-profile__chip--score { background: var(--m-brand-soft); color: var(--m-brand-strong); font-variant-numeric: tabular-nums; }
.crm-profile__chip--status { background: var(--m-surface-inset); color: var(--m-text); }
.crm-profile__owner, .crm-profile__nickline { margin: 0; display: flex; gap: var(--m-space-2); align-items: flex-start; font-size: var(--m-font-meta); color: var(--m-text); overflow-wrap: anywhere; }
.crm-profile__owner--none { color: var(--m-muted); }
.crm-profile__nickline { color: var(--m-muted); }
.crm-profile__owner .mdi, .crm-profile__nickline .mdi { flex: none; font-size: 16px; line-height: 1.4; }
.crm-profile__actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: var(--m-space-2); }
.crm-profile__act {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 0 var(--m-space-3);
  border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text);
  font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-profile__act--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); grid-column: 1 / -1; }
.crm-profile__act:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-profile__h { margin: 0 0 var(--m-space-3); font-size: var(--m-font-section); font-weight: 650; }
.crm-profile__dl { margin: 0; display: flex; flex-direction: column; }
.crm-profile__row { display: flex; flex-direction: column; gap: 2px; padding: var(--m-space-2) 0; border-bottom: 1px solid var(--m-line); }
.crm-profile__row:last-child { border-bottom: 0; }
.crm-profile__row dt { font-size: 12px; font-weight: 650; color: var(--m-muted); }
.crm-profile__row dd { margin: 0; overflow-wrap: anywhere; }
.crm-profile__empty, .crm-profile__note { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-profile__nicks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-profile__nick { padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-surface-inset); display: flex; flex-direction: column; gap: 2px; }
.crm-profile__nick-top { display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); }
.crm-profile__nick-name { min-width: 0; overflow-wrap: anywhere; }
.crm-profile__nick-sub { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.crm-profile__tags { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--m-space-2); }
.crm-profile__tag { padding: 4px 12px; border-radius: 999px; background: var(--m-surface-inset); font-size: var(--m-font-meta); font-weight: 600; }
</style>
