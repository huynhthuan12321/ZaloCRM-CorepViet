<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Form tạo/sửa Nhãn KH (sheet). Presenter: không gọi API. dirty -> MobileSheet hỏi trước khi đóng. -->
<template>
  <MobileSheet :open="open" :title="tag ? 'Sửa nhãn' : 'Thêm nhãn'" :dirty="dirty" :persistent="saving" @update:open="emit('update:open', $event)">
    <form id="crm-tag-form" class="crm-tf" novalidate @submit.prevent="emit('submit', { ...form, priority: Number(form.priority) || 99 })">
      <p v-if="error" class="crm-tf__err" role="alert">{{ error }}</p>
      <p v-if="tag?.source === 'zalo_real'" class="crm-tf__note"><i class="mdi mdi-sync" aria-hidden="true" /> Nhãn Zalo Real: lưu sẽ đồng bộ ngược lên Zalo{{ tag.zaloAccount ? ` (nick ${tag.zaloAccount.displayName})` : '' }}.</p>
      <div class="crm-tf__field">
        <label for="tf-name">Tên nhãn <span>(bắt buộc)</span></label>
        <input id="tf-name" v-model="form.name" type="text" autocomplete="off" />
      </div>
      <div class="crm-tf__field">
        <span class="crm-tf__lab" id="tf-color-l">Màu</span>
        <div class="crm-tf__palette" role="radiogroup" aria-labelledby="tf-color-l">
          <button v-for="c in palette" :key="c.hex" type="button" role="radio" class="crm-tf__sw" :class="{ 'crm-tf__sw--on': form.color.toLowerCase() === c.hex.toLowerCase() }" :style="{ background: c.hex }" :aria-checked="form.color.toLowerCase() === c.hex.toLowerCase()" :aria-label="c.name" @click="form.color = c.hex" />
        </div>
        <p v-if="!inPalette" class="crm-tf__hint">Màu hiện tại ({{ form.color }}) nằm ngoài bảng màu Zalo; chọn một màu ở trên để đổi.</p>
      </div>
      <div class="crm-tf__field">
        <label for="tf-emoji">Biểu tượng (emoji)</label>
        <input id="tf-emoji" v-model="form.emoji" type="text" maxlength="8" autocomplete="off" />
      </div>
      <div class="crm-tf__field">
        <label for="tf-prio">Ưu tiên (1–99, số nhỏ hiện trước)</label>
        <input id="tf-prio" v-model.number="form.priority" type="number" inputmode="numeric" min="1" max="99" :disabled="!tag" />
        <p v-if="!tag" class="crm-tf__hint">Nhãn mới có ưu tiên mặc định 99; đổi sau khi tạo.</p>
      </div>
      <div v-if="!tag" class="crm-tf__field">
        <label for="tf-src">Nguồn</label>
        <select id="tf-src" v-model="form.source">
          <option v-for="s in sources" :key="s" :value="s">{{ SOURCE_LABEL[s] ?? s }}</option>
        </select>
      </div>
      <button v-if="tag" type="button" class="crm-tf__archive" :disabled="saving || tag.source === 'zalo_real'" @click="emit('archive')">
        <i class="mdi mdi-archive-outline" aria-hidden="true" /> Lưu trữ nhãn này
      </button>
      <p v-if="tag?.source === 'zalo_real'" class="crm-tf__hint">Nhãn Zalo Real không thể lưu trữ.</p>
    </form>
    <template #footer="{ requestClose }">
      <div class="crm-tf__foot">
        <button type="button" class="crm-tf__btn" :disabled="saving" @click="requestClose">Hủy</button>
        <button type="submit" form="crm-tag-form" class="crm-tf__btn crm-tf__btn--primary" :disabled="saving">{{ saving ? 'Đang lưu…' : tag ? 'Lưu thay đổi' : 'Tạo nhãn' }}</button>
      </div>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { emptyTagForm, isTagFormDirty, SOURCE_LABEL, SOURCES_BY_SCOPE, tagToForm, ZALO_PALETTE, type MobileTag, type TagForm, type TagScope } from '@/composables/mobile-settings/use-mobile-tags';

const props = withDefaults(defineProps<{ open: boolean; tag: MobileTag | null; scope?: TagScope; saving?: boolean; error?: string }>(), { scope: 'crm', saving: false, error: '' });
const emit = defineEmits<{ 'update:open': [open: boolean]; submit: [form: TagForm]; archive: [] }>();
const sources = computed(() => SOURCES_BY_SCOPE[props.scope].filter((s) => s !== 'zalo_real'));

const palette = ZALO_PALETTE;
const form = ref<TagForm>(emptyTagForm(props.scope));
const baseline = ref<TagForm>(emptyTagForm(props.scope));
const dirty = computed(() => props.open && isTagFormDirty(form.value, baseline.value));
const inPalette = computed(() => palette.some(c => c.hex.toLowerCase() === form.value.color.toLowerCase()));

watch(() => props.open, (o) => {
  if (!o) return;
  const f = props.tag ? tagToForm(props.tag) : emptyTagForm(props.scope);
  form.value = { ...f };
  baseline.value = { ...f };
});
</script>

<style scoped>
.crm-tf { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); color: var(--m-text); }
.crm-tf__field { display: flex; flex-direction: column; gap: var(--m-space-1); }
.crm-tf__field label, .crm-tf__lab { font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); }
.crm-tf__field label span { font-weight: 500; }
.crm-tf__field select { width: 100%; min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; box-sizing: border-box; }
.crm-tf__archive { display: inline-flex; align-items: center; justify-content: center; gap: var(--m-space-2); min-height: 48px; border: 1px solid var(--m-danger); border-radius: var(--m-radius-md); background: transparent; color: var(--m-danger); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-tf__archive:disabled { opacity: 0.6; }
.crm-tf__archive:focus-visible, .crm-tf__field select:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-tf__field input { width: 100%; min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; box-sizing: border-box; }
.crm-tf__field input:disabled { opacity: 0.6; }
.crm-tf__palette { display: flex; flex-wrap: wrap; gap: var(--m-space-2); }
.crm-tf__sw { width: var(--m-touch); height: var(--m-touch); border: 3px solid transparent; border-radius: 50%; background-clip: padding-box; box-shadow: 0 0 0 1px var(--m-line); cursor: pointer; touch-action: manipulation; }
.crm-tf__sw--on { border-color: var(--m-text); }
.crm-tf__hint { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-tf__note { display: flex; gap: var(--m-space-2); margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-surface-inset); font-size: var(--m-font-meta); }
.crm-tf__err { margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-weight: 600; }
.crm-tf__foot { display: flex; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-space-5); }
.crm-tf__btn { flex: 1; min-height: 48px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-tf__btn:disabled { opacity: 0.6; cursor: default; }
.crm-tf__btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-tf input:focus-visible, .crm-tf__btn:focus-visible, .crm-tf__sw:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
