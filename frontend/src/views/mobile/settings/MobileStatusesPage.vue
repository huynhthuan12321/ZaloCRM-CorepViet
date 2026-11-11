<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- "Trạng thái KH" (F1): bảng -> thẻ; thêm/sửa trong sheet, đổi thứ tự bằng nút lên/xuống, xóa có xác nhận. Cùng API với desktop. -->
<template>
  <section class="crm-sp">
    <div class="crm-sp__bar">
      <p class="crm-sp__hint">Thứ tự trên = ưu tiên cao hơn khi trạng thái cha tổng hợp từ con.</p>
      <button type="button" class="crm-sp__add" :disabled="st.state.value !== 'ready'" @click="openCreate"><i class="mdi mdi-plus" aria-hidden="true" />Thêm</button>
    </div>

    <MobileFeedback v-if="st.state.value === 'loading'" state="loading" />
    <MobileFeedback v-else-if="st.state.value !== 'ready'" :state="st.state.value" :title="st.state.value === 'error' ? 'Không tải được trạng thái' : undefined" retryable @retry="st.load()" />
    <MobileFeedback v-else-if="st.items.value.length === 0" state="empty" title="Chưa có trạng thái" description="Bấm Thêm để tạo trạng thái đầu tiên." />
    <ul v-else class="crm-sp__list" aria-label="Danh sách trạng thái khách hàng">
      <li v-for="(s, i) in st.items.value" :key="s.id" class="crm-sp__card">
        <div class="crm-sp__main">
          <span class="crm-sp__chip" :style="{ background: chipBackground(s.color) }"><span class="crm-sp__dot" :style="{ background: s.color || '#999' }" aria-hidden="true" />{{ s.name }}</span>
          <span class="crm-sp__tags">
            <span class="crm-sp__tag">Thứ tự {{ s.order }}</span>
            <span v-if="s.isTerminal" class="crm-sp__tag">Kết thúc</span>
            <span v-if="s.isDefault" class="crm-sp__tag">Mặc định</span>
          </span>
        </div>
        <div class="crm-sp__acts">
          <button type="button" class="crm-sp__ib" :aria-label="`Đưa ${s.name} lên`" :disabled="i === 0 || st.saving.value" @click="st.move(s.id, -1)"><i class="mdi mdi-arrow-up" aria-hidden="true" /></button>
          <button type="button" class="crm-sp__ib" :aria-label="`Đưa ${s.name} xuống`" :disabled="i === st.items.value.length - 1 || st.saving.value" @click="st.move(s.id, 1)"><i class="mdi mdi-arrow-down" aria-hidden="true" /></button>
          <button type="button" class="crm-sp__ib" :aria-label="`Sửa ${s.name}`" @click="openEdit(s)"><i class="mdi mdi-pencil-outline" aria-hidden="true" /></button>
          <button type="button" class="crm-sp__ib crm-sp__ib--danger" :aria-label="`Xóa ${s.name}`" :disabled="st.saving.value" @click="askDelete(s)"><i class="mdi mdi-trash-can-outline" aria-hidden="true" /></button>
        </div>
      </li>
    </ul>

    <StatusFormSheet v-model:open="sheetOpen" :status="editing" :count="st.items.value.length" :saving="st.saving.value" :error="st.formError.value" @submit="onSubmit" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import StatusFormSheet from '@/components/mobile/settings/StatusFormSheet.vue';
import { useConfirm } from '@/composables/use-confirm';
import { chipBackground, useMobileStatuses, type MobileStatus, type StatusForm } from '@/composables/mobile-settings/use-mobile-statuses';

const st = useMobileStatuses();
const { confirm } = useConfirm();
const sheetOpen = ref(false);
const editing = ref<MobileStatus | null>(null);
onMounted(() => { void st.load(); });

function openCreate() { editing.value = null; st.formError.value = ''; sheetOpen.value = true; }
function openEdit(s: MobileStatus) { editing.value = s; st.formError.value = ''; sheetOpen.value = true; }
async function onSubmit(form: StatusForm) {
  if (await st.save(form, editing.value?.id ?? null)) sheetOpen.value = false;
}
async function askDelete(s: MobileStatus) {
  const ok = await confirm({ title: `Xóa trạng thái "${s.name}"?`, message: 'Máy chủ sẽ từ chối nếu trạng thái đang được dùng.', tone: 'danger', confirmText: 'Xóa', cancelText: 'Giữ lại' });
  if (ok) await st.remove(s.id);
}
</script>

<style scoped>
.crm-sp { display: flex; flex-direction: column; gap: var(--m-space-4); color: var(--m-text); }
.crm-sp__bar { display: flex; align-items: center; gap: var(--m-space-3); }
.crm-sp__hint { flex: 1; min-width: 0; margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-sp__add { flex: none; display: inline-flex; align-items: center; gap: var(--m-space-1); min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 0; border-radius: var(--m-radius-md); background: var(--m-brand-strong); color: var(--m-on-action); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-sp__add:disabled { opacity: 0.5; }
.crm-sp__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-sp__card { display: flex; flex-direction: column; gap: var(--m-space-2); padding: var(--m-space-3) var(--m-space-3) var(--m-space-2) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); }
.crm-sp__main { display: flex; flex-direction: column; align-items: flex-start; gap: var(--m-space-2); min-width: 0; }
.crm-sp__chip { display: inline-flex; align-items: center; gap: var(--m-space-2); max-width: 100%; padding: 4px 12px; border-radius: 999px; color: var(--m-text); font-weight: 650; overflow-wrap: anywhere; }
.crm-sp__dot { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--m-line); }
.crm-sp__tags { display: flex; flex-wrap: wrap; gap: var(--m-space-1); }
.crm-sp__tag { padding: 0 8px; border-radius: 999px; background: var(--m-surface-inset); color: var(--m-muted); font-size: 12px; font-weight: 650; }
.crm-sp__acts { display: flex; justify-content: flex-end; gap: var(--m-space-1); }
.crm-sp__ib { display: inline-grid; place-items: center; width: var(--m-touch); height: var(--m-touch); border: 0; border-radius: var(--m-radius-md); background: transparent; color: var(--m-brand-strong); font-size: 22px; cursor: pointer; touch-action: manipulation; }
.crm-sp__ib--danger { color: var(--m-danger); }
.crm-sp__ib:disabled { opacity: 0.35; cursor: default; }
.crm-sp__ib:focus-visible, .crm-sp__add:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
