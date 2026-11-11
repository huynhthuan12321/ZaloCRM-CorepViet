<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- "Nhãn KH" (F1): thẻ theo tab Nhãn CRM / Nhãn bạn bè, lọc nguồn + nick Zalo, tìm theo tên, thêm/sửa/lưu trữ trong sheet. Gộp nhãn/đếm lại -> Dùng máy tính. -->
<template>
  <section class="crm-tp">
    <div class="crm-tp__tabs" role="tablist" aria-label="Loại nhãn">
      <button v-for="t in TABS" :key="t.value" type="button" role="tab" class="crm-tp__tab" :aria-selected="tg.scope.value === t.value" @click="tg.setScope(t.value)">
        {{ t.label }} <span class="crm-tp__n">{{ tg.counts.value[t.value] }}</span>
      </button>
    </div>
    <div class="crm-tp__bar">
      <div class="crm-tp__search">
        <i class="mdi mdi-magnify" aria-hidden="true" />
        <input v-model="tg.query.value" type="search" inputmode="search" autocomplete="off" placeholder="Tìm nhãn" aria-label="Tìm nhãn" />
      </div>
      <button type="button" class="crm-tp__add" :disabled="tg.state.value !== 'ready'" @click="openCreate"><i class="mdi mdi-plus" aria-hidden="true" />Thêm</button>
    </div>

    <div v-if="tg.state.value === 'ready'" class="crm-tp__filters">
      <label class="crm-tp__f">
        <span>Nguồn</span>
        <select :value="tg.source.value ?? ''" @change="tg.source.value = (($event.target as HTMLSelectElement).value) || null">
          <option value="">Tất cả nguồn</option>
          <option v-for="s in SOURCES_BY_SCOPE[tg.scope.value]" :key="s" :value="s">{{ SOURCE_LABEL[s] ?? s }}</option>
        </select>
      </label>
      <label v-if="tg.scope.value === 'friend'" class="crm-tp__f">
        <span>Nick Zalo</span>
        <select :value="tg.nickId.value ?? ''" @change="tg.nickId.value = (($event.target as HTMLSelectElement).value) || null">
          <option value="">Tất cả nick ({{ tg.nicks.value.length }})</option>
          <option v-for="n in tg.nicks.value" :key="n.id" :value="n.id">{{ n.displayName }}{{ n.phone ? ' · ' + n.phone : '' }}</option>
        </select>
      </label>
    </div>

    <MobileFeedback v-if="tg.state.value === 'loading'" state="loading" />
    <MobileFeedback v-else-if="tg.state.value !== 'ready'" :state="tg.state.value" :title="tg.state.value === 'error' ? 'Không tải được nhãn' : undefined" retryable @retry="tg.load()" />
    <MobileFeedback v-else-if="tg.visible.value.length === 0" state="empty" :title="hasFilter ? 'Không có nhãn khớp bộ lọc' : 'Chưa có nhãn'" :clearable="hasFilter" @clear-filters="clearFilters" />
    <ul v-else class="crm-tp__list" aria-label="Danh sách nhãn">
      <li v-for="t in tg.visible.value" :key="t.id">
        <button type="button" class="crm-tp__card" @click="openEdit(t)">
          <span class="crm-tp__sw" :style="{ background: t.color }" aria-hidden="true" />
          <span class="crm-tp__body">
            <span class="crm-tp__name">{{ t.emoji ? `${t.emoji} ` : '' }}{{ t.name }}</span>
            <span class="crm-tp__meta">{{ SOURCE_LABEL[t.source] ?? t.source }}<template v-if="t.zaloAccount"> · {{ t.zaloAccount.displayName }}</template> · {{ t.usageCount }} khách</span>
          </span>
          <i class="mdi mdi-pencil-outline crm-tp__edit" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <MobileDesktopNotice action="gộp nhãn và đếm lại lượt dùng" />
    <TagFormSheet v-model:open="sheetOpen" :tag="editing" :scope="tg.scope.value" :saving="tg.saving.value" :error="tg.formError.value" @submit="onSubmit" @archive="onArchive" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useConfirm } from '@/composables/use-confirm';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MobileDesktopNotice from '@/components/mobile/settings/MobileDesktopNotice.vue';
import TagFormSheet from '@/components/mobile/settings/TagFormSheet.vue';
import { SOURCE_LABEL, SOURCES_BY_SCOPE, useMobileTags, type MobileTag, type TagForm, type TagScope } from '@/composables/mobile-settings/use-mobile-tags';

const TABS: ReadonlyArray<{ value: TagScope; label: string }> = [{ value: 'crm', label: 'Nhãn CRM' }, { value: 'friend', label: 'Nhãn bạn bè' }];
const tg = useMobileTags();
const sheetOpen = ref(false);
const editing = ref<MobileTag | null>(null);
onMounted(() => { void tg.load(); });

function openCreate() { editing.value = null; tg.formError.value = ''; sheetOpen.value = true; }
function openEdit(t: MobileTag) { editing.value = t; tg.formError.value = ''; sheetOpen.value = true; }
const { confirm } = useConfirm();
const hasFilter = computed(() => !!(tg.query.value.trim() || tg.source.value || tg.nickId.value));
function clearFilters() { tg.query.value = ''; tg.source.value = null; tg.nickId.value = null; }
async function onArchive() {
  const t = editing.value;
  if (!t) return;
  const ok = await confirm({ title: 'Lưu trữ nhãn này?', message: 'Khách đã gắn nhãn vẫn giữ nguyên, nhưng nhãn không còn xuất hiện trong gợi ý.', confirmText: 'Lưu trữ', cancelText: 'Hủy', tone: 'danger' });
  if (ok && (await tg.archive(t))) sheetOpen.value = false;
}
async function onSubmit(form: TagForm) {
  if (await tg.save(form, editing.value)) sheetOpen.value = false;
}
</script>

<style scoped>
.crm-tp { display: flex; flex-direction: column; gap: var(--m-space-4); color: var(--m-text); }
.crm-tp__tabs { display: flex; gap: var(--m-space-1); padding: 3px; border-radius: var(--m-radius-md); background: var(--m-surface-inset); }
.crm-tp__tab { flex: 1; min-height: 44px; border: 0; border-radius: var(--m-radius-sm); background: transparent; color: var(--m-muted); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-tp__tab[aria-selected='true'] { background: var(--m-surface); color: var(--m-text); box-shadow: var(--m-shadow-rest); }
.crm-tp__n { opacity: 0.75; font-weight: 500; }
.crm-tp__bar { display: flex; gap: var(--m-space-3); }
.crm-tp__search { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--m-space-2); min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-muted); }
.crm-tp__search input { flex: 1; min-width: 0; height: 44px; border: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; outline: none; -webkit-appearance: none; appearance: none; }
.crm-tp__search:focus-within { border-color: var(--m-focus); outline: 2px solid var(--m-focus); }
.crm-tp__add { flex: none; display: inline-flex; align-items: center; gap: var(--m-space-1); min-height: 48px; padding: 0 var(--m-space-4); border: 0; border-radius: var(--m-radius-md); background: var(--m-brand-strong); color: var(--m-on-action); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-tp__add:disabled { opacity: 0.5; }
.crm-tp__filters { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--m-space-2); }
.crm-tp__f { display: flex; flex-direction: column; gap: 4px; font-size: var(--m-font-meta); color: var(--m-muted); min-width: 0; }
.crm-tp__f select { min-height: 48px; width: 100%; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; }
.crm-tp__f select:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-tp__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-tp__card { display: flex; align-items: center; gap: var(--m-space-3); width: 100%; min-height: 64px; padding: var(--m-space-3) var(--m-space-3) var(--m-space-3) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; box-sizing: border-box; }
.crm-tp__card:active { background: var(--m-surface-inset); }
.crm-tp__sw { flex: none; width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 0 0 1px var(--m-line); }
.crm-tp__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crm-tp__name { font-weight: 650; overflow-wrap: anywhere; }
.crm-tp__meta { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.crm-tp__edit { flex: none; font-size: 22px; color: var(--m-brand-strong); }
.crm-tp__tab:focus-visible, .crm-tp__card:focus-visible, .crm-tp__add:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
