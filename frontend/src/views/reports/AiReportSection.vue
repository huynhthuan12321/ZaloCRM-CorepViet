<script setup lang="ts">
import ReportTable from './ReportTable.vue'
import { computed } from 'vue'
import type { AiReportSection, AiReportKpis } from '@/types/ai-report'

const props = defineProps<{ title: string; description: string; section: AiReportSection }>()
const metrics: Array<{ key: keyof AiReportKpis; label: string; hint: string }> = [
  { key: 'sentMessages', label: 'Tin AI ghi nhận đã gửi', hint: 'Message hợp lệ · không bảo đảm khách đã nhận' },
  { key: 'conversations', label: 'Hội thoại có AI gửi', hint: 'Đếm riêng biệt trong kỳ' },
  { key: 'autoReplies', label: 'Auto reply đã phân loại', hint: 'Có audit khớp Message' },
  { key: 'followups', label: 'Followup đã phân loại', hint: 'Có dấu followup hoặc audit khớp' },
  { key: 'unclassified', label: 'Tin chưa phân loại', hint: 'Vẫn nằm trong tổng tin AI' },
  { key: 'reviewDraftsCreated', label: 'Nháp cần duyệt đã tạo', hint: 'Bản ghi trong kỳ · không phải số đang chờ' },
]
const activeDates = computed(() => props.section.series.filter(row => row.sentMessages > 0 || row.reviewDraftsCreated > 0))
const number = (value: number) => value.toLocaleString('vi-VN')
</script>

<template>
  <section :aria-label="title" class="ai-report-section">
    <h2 class="rpt-h1">{{ title }}</h2>
    <p class="rpt-sub">{{ description }}</p>
    <p v-if="section.kpis.unclassified > 0" class="rpt-sub ai-classification-note">Chưa đủ dữ liệu để xác định toàn bộ auto reply/followup. Các số đã phân loại chỉ gồm tin có bằng chứng; {{ number(section.kpis.unclassified) }} tin còn lại chưa phân loại.</p>
    <div class="grid g-3" style="margin:16px 0">
      <div v-for="metric in metrics" :key="metric.key" class="kpi" :data-metric="metric.key">
        <div class="top"><span class="label">{{ metric.label }}</span></div>
        <div class="val">{{ number(section.kpis[metric.key]) }}</div>
        <div class="sub">{{ metric.hint }}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><div class="t">Theo ngày Việt Nam</div><span class="meta">Chỉ ngày có ghi nhận</span></div>
      <div v-if="activeDates.length" class="ai-report-table">
        <ReportTable label="Bảng số liệu AI"><table class="tbl">
          <thead><tr><th>Ngày</th><th>Tin AI</th><th>Auto reply</th><th>Followup</th><th>Chưa phân loại</th><th>Nháp đã tạo</th></tr></thead>
          <tbody><tr v-for="row in activeDates" :key="row.date">
            <td>{{ row.date }}</td><td>{{ number(row.sentMessages) }}</td><td>{{ number(row.autoReplies) }}</td>
            <td>{{ number(row.followups) }}</td><td>{{ number(row.unclassified) }}</td><td>{{ number(row.reviewDraftsCreated) }}</td>
          </tr></tbody>
        </table></ReportTable>
      </div>
      <div v-else class="rk-empty">Chưa ghi nhận tin AI hoặc nháp cần duyệt trong kỳ này.</div>
    </div>
  </section>
</template>

<style scoped>
.ai-report-section { margin-bottom: 24px; }
.ai-report-table { overflow-x: auto; }
.ai-report-table table { min-width: 620px; }
</style>
