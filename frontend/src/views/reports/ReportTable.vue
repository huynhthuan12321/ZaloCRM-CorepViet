<script setup lang="ts">
import { useId } from 'vue'
defineProps<{ label: string }>()
const hintId = useId()
</script>

<template>
  <div class="rpt-table-frame">
    <p :id="hintId" class="rpt-scroll-hint">Cuộn ngang để xem thêm cột. Có thể dùng phím mũi tên khi chọn bảng.</p>
    <div class="rpt-table-scroll" role="region" tabindex="0" :aria-label="label" :aria-describedby="hintId">
      <slot />
    </div>
  </div>
</template>
