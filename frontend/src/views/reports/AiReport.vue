<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '@/api'
import type { AiReportData, UnavailableAiMetric } from '@/types/ai-report'
import { vietnamDateRange } from '@/utils/report-period'
import AiReportSection from './AiReportSection.vue'

const range = ref(30)
const ranges = [{ days: 1, label: 'Hôm nay' }, { days: 7, label: '7 ngày' }, { days: 30, label: '30 ngày' }]
const data = ref<AiReportData | null>(null)
const loading = ref(true)
const loadError = ref('')
let sequence = 0
let controller: AbortController | undefined
const unavailableMetrics: Array<{ key: UnavailableAiMetric; label: string; reason: string }> = [
  { key: 'pendingReviews', label: 'Nháp hiện đang chờ duyệt', reason: 'Chưa có vòng đời duyệt/gửi đầy đủ.' },
  { key: 'tokens', label: 'Token đã dùng', reason: 'Chưa có nguồn token usage được đối soát.' },
  { key: 'cost', label: 'Chi phí thực tế', reason: 'Chưa có bản ghi chi phí thực tế.' },
  { key: 'handoffRate', label: 'Tỉ lệ chuyển nhân viên', reason: 'Chưa có sự kiện chuyển giao đầy đủ.' },
  { key: 'conversionRate', label: 'Tỉ lệ chuyển đổi', reason: 'Chưa có định nghĩa/sự kiện chuyển đổi tin cậy.' },
]
const updatedAt = computed(() => data.value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(data.value.asOf)) : '')

async function load() {
  const current = ++sequence
  controller?.abort()
  controller = new AbortController()
  const period = vietnamDateRange(range.value)
  loading.value = true
  data.value = null
  loadError.value = ''
  try {
    const response = await api.get<AiReportData>('/reports/ai', { params: period, signal: controller.signal })
    if (current !== sequence) return
    if (response.data.from !== period.from || response.data.to !== period.to) throw new Error('AI report period mismatch')
    data.value = response.data
  } catch (error) {
    if (current === sequence) {
      loadError.value = 'Không tải được báo cáo AI. Hãy thử lại.'
      console.error('[AiReport] load failed', error)
    }
  } finally { if (current === sequence) loading.value = false }
}
watch(range, load, { immediate: true })
onBeforeUnmount(() => { sequence++; controller?.abort() })
</script>

<template>
  <div class="rpt">
    <div class="rpt-head">
      <div class="rpt-titles"><v-icon icon="mdi-robot-outline" size="24" /><div>
        <h1 class="rpt-h1">Báo cáo AI</h1>
        <p class="rpt-sub">Tin AI ghi nhận đã gửi và nháp cần duyệt đã tạo. Không dùng số lượt gợi ý làm số tin gửi hoặc số lần gọi model.</p>
      </div></div>
      <button class="rk-btn ghost" :disabled="loading" @click="load">Làm mới</button>
    </div>
    <div class="rpt-filters"><div class="seg" aria-label="Kỳ báo cáo AI">
      <button v-for="item in ranges" :key="item.days" :class="{ on: range === item.days }" :aria-pressed="range === item.days" @click="range = item.days">{{ item.label }}</button>
    </div></div>
    <div v-if="loading" class="rk-loading" role="status">Đang tải báo cáo AI…</div>
    <div v-else-if="loadError" class="rk-empty" role="alert">{{ loadError }} <button class="rk-btn ghost" @click="load">Thử lại</button></div>
    <template v-else-if="data">
      <p class="rpt-sub" style="margin-bottom:16px">{{ data.from }} – {{ data.to }} · Giờ Việt Nam · Phạm vi: {{ data.scope.kind === 'org' ? 'Tổ chức' : 'Phòng ban và phòng con' }}. Ghi nhận đến {{ updatedAt }}.</p>
      <AiReportSection title="KPI chính" description="Tin thuộc nick trong phạm vi chính; AI không được cộng vào thành tích tin người gửi." :section="data.main" />
      <AiReportSection v-if="data.shared" title="Nick được cấp thêm" :description="`${data.scope.sharedAccounts} nick ngoài phạm vi chính được cấp quyền đọc. Số liệu tách riêng, không cộng vào KPI chính.`" :section="data.shared" />
      <section aria-label="Chỉ số chưa đủ nguồn" class="card">
        <div class="card-h"><h2 class="t">Chỉ số chưa đủ nguồn</h2></div>
        <div class="grid g-3" style="padding:16px">
          <div v-for="metric in unavailableMetrics" :key="metric.key">
            <strong>{{ metric.label }}</strong><p>Chưa có dữ liệu</p><small>{{ metric.reason }}</small>
          </div>
        </div>
      </section>
      <p class="rpt-sub" style="margin-top:16px">Loại tin local, dry-run, test, đã xóa, hội thoại nhóm/nội bộ/đã xóa. Audit chỉ bổ sung phân loại, không cộng thêm tin. Thiếu dấu phân loại được giữ ở “Chưa phân loại”. Nháp đã tạo không chứng minh nháp còn chờ hoặc đã được duyệt gửi; áp dụng trường CRM không phải duyệt tin nhắn.</p>
    </template>
  </div>
</template>
