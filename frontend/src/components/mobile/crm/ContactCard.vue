<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Thẻ khách hàng mobile. Signature (system.md): luôn hiện nick + người phụ trách ("+N" khi có người cùng chăm, D-4).
  List API chỉ trả SỐ nick (nicksByKind), không trả tên nick -> hiện "N nick Zalo", không bịa tên. Presenter thuần.
-->
<template>
  <button type="button" class="crm-contact-card" :aria-label="ariaLabel" @click="emit('openProfile', contact.id)">
    <Avatar class="crm-contact-card__avatar" :src="contact.avatarUrl || null" :name="name" :size="48" :gradient-seed="contact.id" />
    <span class="crm-contact-card__body">
      <span class="crm-contact-card__top">
        <span class="crm-contact-card__name">{{ name }}</span>
        <span v-if="statusLabel" class="crm-contact-card__status" :class="`crm-tone--${tone}`">{{ statusLabel }}</span>
      </span>
      <span class="crm-contact-card__phone">{{ phoneText }}</span>
      <span v-if="previewText" class="crm-contact-card__preview">
        <i v-if="redacted" class="mdi mdi-lock-outline" aria-hidden="true" />{{ previewText }}
      </span>
      <span class="crm-contact-card__context">
        <span class="crm-contact-card__nick"><i class="mdi mdi-chat-processing-outline" aria-hidden="true" />{{ nickText }}</span>
        <span class="crm-contact-card__owner" :class="{ 'crm-contact-card__owner--none': !ownerName }">
          <i class="mdi mdi-account-outline" aria-hidden="true" />{{ ownerText }}
        </span>
      </span>
    </span>
    <i class="mdi mdi-chevron-right crm-contact-card__chev" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Avatar from '@/components/ui/Avatar.vue';
import { cleanPreview, formatRecentDateTime } from '@/composables/use-contacts';
import { displayPhone } from '@/composables/use-phone-format';
import { contactName, contactRedacted, contactStatusTone } from './crm-model';
import type { ContactCardEmits, ContactCardProps } from './types';

const props = withDefaults(defineProps<ContactCardProps>(), { ownerExtra: 0, nickCount: 0 });
const emit = defineEmits<ContactCardEmits>();

const name = computed(() => contactName(props.contact));
const tone = computed(() => contactStatusTone(props.contact));
const redacted = computed(() => contactRedacted(props.contact));
const phoneText = computed(() => displayPhone(props.contact.phone) || 'Chưa có SĐT');
const nickText = computed(() => (props.nickCount > 0 ? `${props.nickCount} nick Zalo` : 'Chưa có nick Zalo'));
const ownerText = computed(() => {
  if (!props.ownerName) return 'Chưa phân công';
  return props.ownerExtra > 0 ? `Phụ trách: ${props.ownerName} +${props.ownerExtra}` : `Phụ trách: ${props.ownerName}`;
});
const previewText = computed(() => {
  const c = props.contact;
  if (!c.lastInboundAt) return '';
  if (redacted.value) return 'Nội dung riêng tư';
  const body = cleanPreview(c.lastInboundPreview, c.lastInboundType ?? null, 80);
  const when = formatRecentDateTime(c.lastInboundAt);
  return body ? `${when} · ${body}` : when;
});
const ariaLabel = computed(() => {
  const parts = [name.value, phoneText.value];
  if (props.statusLabel) parts.push(`trạng thái ${props.statusLabel}`);
  parts.push(nickText.value, props.ownerName ? `phụ trách ${props.ownerName}${props.ownerExtra > 0 ? `, cùng chăm thêm ${props.ownerExtra} người` : ''}` : 'chưa phân công');
  return parts.join(', ');
});
</script>

<style scoped>
.crm-contact-card {
  display: flex;
  align-items: flex-start;
  gap: var(--m-space-3);
  width: 100%;
  min-height: 72px;
  padding: var(--m-space-3) var(--m-space-3) var(--m-space-3) var(--m-space-4);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-card);
  background: var(--m-surface);
  color: var(--m-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: var(--m-tap-highlight);
}
.crm-contact-card:active { background: var(--m-surface-inset); }
.crm-contact-card:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-contact-card__avatar { flex: none; }
.crm-contact-card__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crm-contact-card__top { display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); min-width: 0; }
.crm-contact-card__name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--m-font-body); font-weight: 650; line-height: 1.3;
}
.crm-contact-card__status {
  flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 650; line-height: 1.4;
  background: var(--m-surface-inset); color: var(--m-muted);
}
.crm-tone--info { background: var(--m-brand-soft); color: var(--m-brand-strong); }
.crm-tone--warning { background: var(--m-warning-soft); color: var(--m-warning); }
.crm-tone--success { background: var(--m-brand-soft); color: var(--m-success); }
.crm-tone--danger { background: var(--m-surface-inset); color: var(--m-danger); }
.crm-contact-card__phone { font-size: var(--m-font-meta); color: var(--m-muted); font-variant-numeric: tabular-nums; }
.crm-contact-card__preview {
  font-size: var(--m-font-meta); color: var(--m-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.crm-contact-card__preview .mdi { margin-right: 4px; color: var(--m-muted); }
.crm-contact-card__context {
  display: flex; flex-wrap: wrap; gap: 2px var(--m-space-3); margin-top: 2px;
  font-size: 12px; line-height: 1.4; color: var(--m-muted);
}
.crm-contact-card__nick, .crm-contact-card__owner { min-width: 0; display: inline-flex; align-items: center; gap: 4px; overflow-wrap: anywhere; }
.crm-contact-card__owner { color: var(--m-text); font-weight: 600; }
.crm-contact-card__owner--none { color: var(--m-muted); font-weight: 500; }
.crm-contact-card__chev { flex: none; align-self: center; font-size: 22px; color: var(--m-muted); }
</style>
