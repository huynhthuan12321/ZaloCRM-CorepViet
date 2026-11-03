<script setup lang="ts">
import { computed } from 'vue'

interface DisplayContext {
  from?: string
  to?: string
  asOf?: string
  scope?: { kind?: string }
  timeWindows?: { nickSnapshotAsOf?: string }
}
const props = defineProps<{ report: DisplayContext; snapshots?: string }>()
const scopeLabel = computed(() => {
  if (props.report.scope?.kind === 'org') return 'Toàn tổ chức'
  if (props.report.scope?.kind === 'department') return 'Phòng ban và phòng con · theo quyền nick/dữ liệu'
  return 'Theo quyền tài khoản · giới hạn riêng cho từng chỉ số'
})
const timestamp = computed(() => props.report.asOf ?? props.report.timeWindows?.nickSnapshotAsOf)
const updatedLabel = computed(() => {
  if (!timestamp.value || !Number.isFinite(Date.parse(timestamp.value))) return 'API chưa cung cấp thời điểm cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp.value))
})
</script>

<template>
  <aside class="rpt-context" aria-label="Kỳ và phạm vi dữ liệu">
    <p><strong>Kỳ sự kiện</strong> <span>{{ report.from }} – {{ report.to }} · Giờ Việt Nam</span></p>
    <p v-if="report.scope?.kind"><strong>Phạm vi</strong> <span>{{ scopeLabel }}</span></p>
    <p><strong>Thời điểm dữ liệu</strong> <time v-if="timestamp" :datetime="timestamp">{{ updatedLabel }}</time><span v-else>{{ updatedLabel }}</span></p>
    <p v-if="snapshots" class="rpt-snapshot-note">{{ snapshots }} là ảnh chụp hiện tại; không giới hạn theo kỳ sự kiện.</p>
  </aside>
</template>
