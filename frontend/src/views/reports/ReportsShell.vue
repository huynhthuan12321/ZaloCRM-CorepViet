<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { visibleReportCategories } from '@/utils/report-access'
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const content = useTemplateRef<HTMLDivElement>('content')
const visibleTabs = computed(() => visibleReportCategories(auth.user))
const scopeLabel = computed(() => ['owner', 'admin'].includes(auth.user?.role ?? '') ? 'Toàn tổ chức' : 'Phòng ban và phòng con')
function selectCategory(event: Event) {
  const target = (event.target as HTMLSelectElement).value
  if (visibleTabs.value.some(tab => tab.to === target)) void router.push(target)
}
watch(() => route.path, () => { if (content.value) content.value.scrollTop = 0 }, { flush: 'post' })
</script>

<template>
  <div class="rpt-shell crm-mobile">
    <nav class="rpt-subnav" aria-label="Danh mục báo cáo">
      <RouterLink v-for="tab in visibleTabs" :key="tab.to" :to="tab.to"><v-icon :icon="tab.icon" size="17" /> {{ tab.label }}</RouterLink>
    </nav>
    <div class="rpt-category">
      <label for="report-category">Danh mục báo cáo</label>
      <select id="report-category" :value="route.path" @change="selectCategory">
        <option v-for="tab in visibleTabs" :key="tab.to" :value="tab.to">{{ tab.title }}</option>
      </select>
    </div>
    <div class="rpt-access-scope">Phạm vi quyền: <strong>{{ scopeLabel }}</strong>. Từng chỉ số áp dụng quyền nick và dữ liệu tương ứng.</div>
    <div ref="content" class="rpt-scope" tabindex="-1"><RouterView /></div>
  </div>
</template>
