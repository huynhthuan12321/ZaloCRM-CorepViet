<script setup lang="ts">
import { ref, useId } from 'vue'
const props = defineProps<{ open: boolean; title: string; rows: Array<{ label: string; value: string }>; returnFocus?: HTMLElement | null }>()
const emit = defineEmits<{ close: [] }>()
const titleId = useId()
const closeButton = ref<HTMLButtonElement | null>(null)
function restoreFocus() {
  if (props.returnFocus?.isConnected) props.returnFocus.focus({ preventScroll: true })
}
</script>

<template>
  <v-dialog :model-value="open" :aria-labelledby="titleId" max-width="560" scrollable @after-enter="closeButton?.focus({ preventScroll: true })" @after-leave="restoreFocus" @update:model-value="value => { if (!value) emit('close') }">
    <section class="rpt-detail">
      <header><h2 :id="titleId">{{ title }}</h2><button ref="closeButton" class="rk-btn" aria-label="Đóng chi tiết" @click="emit('close')">Đóng</button></header>
      <p>Số liệu trong phạm vi báo cáo hiện tại. Khách phụ trách và chốt là ảnh chụp hiện tại.</p>
      <dl><div v-for="row in rows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
      <button class="rk-btn primary" @click="emit('close')">Quay lại báo cáo</button>
    </section>
  </v-dialog>
</template>
