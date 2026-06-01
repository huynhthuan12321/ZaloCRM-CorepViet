<!--
  AdminQuotaResetModal — Phase 2026-05-28.
  Admin/Manager review noted leads của sale → grant bonus quota.
  Walkthrough từng lead, bấm "Đã review" → form nhập số quota cấp thêm.
-->
<template>
  <div v-if="open" class="aqr-overlay" @click.self="onClose">
    <div class="aqr-modal" role="dialog">
      <header class="aqr-header">
        <div>
          <h2 class="aqr-title">🛡 Reset quota cho <strong>{{ data?.targetUser?.fullName ?? targetUserName }}</strong></h2>
          <p class="aqr-sub">Xem hết noted leads hôm nay rồi cấp thêm quota (1–{{ data?.config?.maxPerDay ?? 10 }})</p>
        </div>
        <button class="aqr-close" @click="onClose" aria-label="Đóng">✕</button>
      </header>

      <div v-if="loading" class="aqr-loading">Đang tải...</div>
      <div v-else-if="errorMsg" class="aqr-error">⚠ {{ errorMsg }}</div>
      <template v-else-if="data">
        <div v-if="data.previousGrantsToday.length > 0" class="aqr-prev-grants">
          <span class="aqr-prev-label">📜 Đã cấp bonus hôm nay:</span>
          <span v-for="(g, i) in data.previousGrantsToday" :key="i" class="aqr-prev-chip">
            +{{ g.bonusCount }} bởi {{ g.grantedByName }} ({{ formatTime(g.createdAt) }})
          </span>
        </div>

        <div class="aqr-progress">
          <div class="aqr-progress-bar">
            <div class="aqr-progress-fill" :style="{ width: progressPct + '%' }"></div>
          </div>
          <span class="aqr-progress-label">
            {{ reviewedCount }} / {{ unreviewedLeads.length }} lead chưa review trong session
            <span v-if="alreadyReviewedCount > 0" class="aqr-progress-prev">({{ alreadyReviewedCount }} đã review trước đó)</span>
          </span>
        </div>

        <div v-if="currentLead" class="aqr-lead-card">
          <div class="aqr-lead-header">
            <div class="aqr-lead-avatar" :style="{ background: avatarColor(currentLead.contactName) }">
              <img
                v-if="currentLead.contactAvatar && !avatarBroken"
                :src="currentLead.contactAvatar"
                referrerpolicy="no-referrer"
                @error="avatarBroken = true"
              />
              <span v-else>{{ initials(currentLead.contactName) }}</span>
            </div>
            <div>
              <div class="aqr-lead-name">{{ currentLead.contactName }}</div>
              <div class="aqr-lead-meta">
                <span v-if="currentLead.contactPhone">📱 {{ currentLead.contactPhone }}</span>
                <span v-if="currentLead.hasZalo" class="aqr-tag-green">🟢 Có Zalo</span>
                <span class="aqr-tag-grey">Score {{ currentLead.priorityScore }}</span>
              </div>
              <div v-if="currentLead.contactLocation" class="aqr-lead-loc">📍 {{ currentLead.contactLocation }}</div>
            </div>
          </div>

          <div class="aqr-lead-times">
            <span>Nhận lúc: <strong>{{ formatDateTime(currentLead.requestedAt) }}</strong></span>
            <span>Note lúc: <strong>{{ formatDateTime(currentLead.noteSubmittedAt) }}</strong></span>
          </div>

          <div class="aqr-lead-note">
            <span class="aqr-note-label">📝 Note của sale:</span>
            <pre class="aqr-note-content">{{ currentLead.noteContent || '(không có nội dung)' }}</pre>
          </div>

          <div class="aqr-walk-actions">
            <button class="aqr-btn-ghost" :disabled="currentIndex === 0" @click="prev">← Lead trước</button>
            <span class="aqr-walk-pos">{{ currentIndex + 1 }} / {{ unreviewedLeads.length }}</span>
            <button class="aqr-btn-primary" @click="confirmReviewCurrent">
              ✅ Đã review · Lead tiếp →
            </button>
          </div>
        </div>

        <div v-if="allReviewed" class="aqr-grant-form">
          <div class="aqr-grant-title">🎉 Đã review hết {{ unreviewedLeads.length }} lead!</div>
          <p class="aqr-grant-sub">Cấp thêm bao nhiêu lead cho {{ data.targetUser?.fullName }} hôm nay?</p>
          <div class="aqr-grant-input-row">
            <button class="aqr-stepper" :disabled="bonusInput <= 1" @click="bonusInput--">−</button>
            <input v-model.number="bonusInput" type="number" :min="1" :max="data.config.maxPerDay" class="aqr-grant-input" />
            <button class="aqr-stepper" :disabled="bonusInput >= data.config.maxPerDay" @click="bonusInput++">+</button>
            <span class="aqr-grant-max">/ tối đa {{ data.config.maxPerDay }}</span>
          </div>
          <input v-model="reasonInput" type="text" class="aqr-reason-input" placeholder="Lý do reset (tuỳ chọn)..." maxlength="200" />
          <button class="aqr-btn-grant" :disabled="submitting || bonusInput < 1" @click="submitGrant">
            <span v-if="submitting">Đang cấp...</span>
            <span v-else>💚 Cấp thêm {{ bonusInput }} lead cho {{ data.targetUser?.fullName }}</span>
          </button>
        </div>

        <div v-if="data.leads.length === 0" class="aqr-empty">
          ⚠ Sale này chưa note lead nào hôm nay → không cần review, có thể cấp luôn.
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api/index';

const props = defineProps<{
  open: boolean;
  targetUserId: string | null;
  targetUserName: string | null;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'granted', payload: { bonusCount: number; reviewedCount: number }): void;
}>();

interface NotedLead {
  id: string; contactId: string; contactName: string;
  contactPhone: string | null; contactAvatar: string | null;
  contactLocation: string; hasZalo: boolean | null;
  requestedAt: string; noteSubmittedAt: string;
  noteContent: string | null; priorityScore: number;
  source: string; alreadyReviewed: boolean;
}
interface ResetData {
  targetUser: { id: string; fullName: string; email: string } | null;
  config: { maxPerDay: number };
  leads: NotedLead[];
  previousGrantsToday: Array<{ bonusCount: number; grantedByName: string | null; createdAt: string }>;
}

const data = ref<ResetData | null>(null);
const loading = ref(false);
const errorMsg = ref('');
const reviewedIds = ref(new Set<string>());
const currentIndex = ref(0);
const bonusInput = ref(5);
const reasonInput = ref('');
const submitting = ref(false);
const avatarBroken = ref(false);

const unreviewedLeads = computed(() => data.value?.leads.filter((l) => !l.alreadyReviewed) ?? []);
const alreadyReviewedCount = computed(() => data.value?.leads.filter((l) => l.alreadyReviewed).length ?? 0);
const reviewedCount = computed(() => reviewedIds.value.size);
const allReviewed = computed(() => unreviewedLeads.value.length === 0 || reviewedCount.value >= unreviewedLeads.value.length);
const currentLead = computed(() => unreviewedLeads.value[currentIndex.value] ?? null);
const progressPct = computed(() => {
  const total = unreviewedLeads.value.length;
  return total === 0 ? 100 : Math.round((reviewedCount.value / total) * 100);
});

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return;
  data.value = null;
  reviewedIds.value = new Set();
  currentIndex.value = 0;
  bonusInput.value = 5;
  reasonInput.value = '';
  errorMsg.value = '';
  avatarBroken.value = false;
  await loadData();
});

async function loadData() {
  if (!props.targetUserId) return;
  loading.value = true;
  try {
    const { data: resp } = await api.get('/lead-pool/admin/sale-noted-leads', {
      params: { userId: props.targetUserId },
    });
    data.value = resp;
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Không tải được danh sách lead';
  } finally {
    loading.value = false;
  }
}

function confirmReviewCurrent() {
  if (!currentLead.value) return;
  reviewedIds.value.add(currentLead.value.id);
  avatarBroken.value = false;
  if (currentIndex.value < unreviewedLeads.value.length - 1) currentIndex.value++;
}

function prev() {
  if (currentIndex.value > 0) { currentIndex.value--; avatarBroken.value = false; }
}

async function submitGrant() {
  if (!data.value || !props.targetUserId) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    await api.post('/lead-pool/admin/reset-quota', {
      targetUserId: props.targetUserId,
      reviewedLeadIds: Array.from(reviewedIds.value),
      bonusCount: bonusInput.value,
      reason: reasonInput.value.trim() || undefined,
    });
    emit('granted', { bonusCount: bonusInput.value, reviewedCount: reviewedIds.value.size });
    emit('close');
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Cấp quota thất bại';
  } finally {
    submitting.value = false;
  }
}

function onClose() { emit('close'); }

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarColor(s: string): string {
  const palette = ['linear-gradient(135deg,#3b82f6,#1e40af)','linear-gradient(135deg,#10b981,#059669)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#8b5cf6,#6d28d9)','linear-gradient(135deg,#ec4899,#be185d)'];
  const h = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[h % palette.length];
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
.aqr-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(2px); }
.aqr-modal { background: white; border-radius: 14px; width: 760px; max-width: 100%; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35); overflow: hidden; }
.aqr-header { display: flex; align-items: flex-start; gap: 12px; padding: 14px 18px; background: linear-gradient(135deg, #EEF0FF 0%, #DBEAFE 100%); border-bottom: 1px solid #C7D2FE; }
.aqr-header > div { flex: 1; }
.aqr-title { margin: 0; font-size: 15px; font-weight: 700; color: #0F172A; }
.aqr-title strong { color: #5E6AD2; }
.aqr-sub { margin: 2px 0 0; font-size: 12px; color: #475569; }
.aqr-close { background: transparent; border: none; cursor: pointer; font-size: 16px; color: #475569; padding: 4px 8px; border-radius: 6px; line-height: 1; }
.aqr-close:hover { background: rgba(0,0,0,0.08); color: #DC2626; }
.aqr-loading, .aqr-error, .aqr-empty { padding: 24px; text-align: center; font-size: 13px; }
.aqr-error { background: #FEF2F2; color: #B91C1C; }
.aqr-empty { background: #FEF3C7; color: #92400E; }
.aqr-prev-grants { background: #F0FDF4; border-bottom: 1px solid #BBF7D0; padding: 8px 18px; font-size: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.aqr-prev-label { color: #166534; font-weight: 700; }
.aqr-prev-chip { background: white; border: 1px solid #86EFAC; padding: 2px 9px; border-radius: 9999px; color: #166534; font-size: 11px; }
.aqr-progress { padding: 10px 18px; background: #F8FAFC; border-bottom: 1px solid #E5E7EB; }
.aqr-progress-bar { height: 6px; background: #E5E7EB; border-radius: 9999px; overflow: hidden; margin-bottom: 4px; }
.aqr-progress-fill { height: 100%; background: linear-gradient(90deg, #10B981, #059669); transition: width 0.3s; }
.aqr-progress-label { font-size: 11.5px; color: #475569; font-weight: 600; }
.aqr-progress-prev { color: #94A3B8; font-weight: 500; margin-left: 6px; }
.aqr-lead-card { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; flex: 1; overflow-y: auto; }
.aqr-lead-header { display: flex; gap: 12px; align-items: center; }
.aqr-lead-avatar { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 18px; flex-shrink: 0; overflow: hidden; }
.aqr-lead-avatar img { width: 100%; height: 100%; object-fit: cover; }
.aqr-lead-name { font-size: 16px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: -0.01em; margin-bottom: 4px; }
.aqr-lead-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; color: #1E40AF; font-weight: 600; }
.aqr-tag-green { background: #DCFCE7; color: #166534; padding: 2px 7px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
.aqr-tag-grey { background: #F1F5F9; color: #475569; padding: 2px 7px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
.aqr-lead-loc { font-size: 12px; color: #64748B; margin-top: 2px; }
.aqr-lead-times { display: flex; gap: 16px; background: #F8FAFC; padding: 8px 12px; border-radius: 8px; font-size: 12px; color: #475569; }
.aqr-lead-times strong { color: #0F172A; font-variant-numeric: tabular-nums; margin-left: 4px; }
.aqr-lead-note { background: linear-gradient(135deg, #FEFCE8, #FEF3C7); border: 1px solid #FCD34D; border-radius: 10px; padding: 12px 14px; }
.aqr-note-label { font-size: 11px; font-weight: 700; color: #78350F; text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 6px; }
.aqr-note-content { margin: 0; padding: 0; font-family: inherit; font-size: 13.5px; color: #0F172A; line-height: 1.55; white-space: pre-wrap; word-wrap: break-word; }
.aqr-walk-actions { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.aqr-walk-pos { flex: 1; text-align: center; font-size: 12px; color: #94A3B8; font-weight: 600; font-variant-numeric: tabular-nums; }
.aqr-grant-form { padding: 16px 18px; background: linear-gradient(180deg, #ECFDF5 0%, #D1FAE5 100%); border-top: 2px solid #86EFAC; display: flex; flex-direction: column; gap: 10px; }
.aqr-grant-title { font-size: 15px; font-weight: 800; color: #047857; }
.aqr-grant-sub { font-size: 13px; color: #065F46; margin: 0; }
.aqr-grant-input-row { display: flex; align-items: center; gap: 8px; }
.aqr-stepper { width: 32px; height: 32px; border-radius: 8px; background: white; border: 1.5px solid #86EFAC; font-size: 18px; font-weight: 700; color: #047857; cursor: pointer; font-family: inherit; }
.aqr-stepper:hover:not(:disabled) { background: #ECFDF5; }
.aqr-stepper:disabled { opacity: 0.4; cursor: not-allowed; }
.aqr-grant-input { width: 70px; height: 32px; text-align: center; border: 1.5px solid #86EFAC; border-radius: 8px; font-size: 15px; font-weight: 700; color: #047857; font-family: inherit; background: white; outline: none; }
.aqr-grant-input:focus { border-color: #10B981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
.aqr-grant-max { font-size: 12px; color: #065F46; font-weight: 600; }
.aqr-reason-input { width: 100%; padding: 8px 12px; border: 1px solid #86EFAC; border-radius: 8px; font-size: 12.5px; font-family: inherit; background: white; outline: none; }
.aqr-reason-input:focus { border-color: #10B981; }
.aqr-btn-primary, .aqr-btn-ghost, .aqr-btn-grant { padding: 9px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
.aqr-btn-primary { background: #5E6AD2; color: white; border: none; }
.aqr-btn-primary:hover { background: #4F46E5; }
.aqr-btn-ghost { background: transparent; color: #475569; border: 1px solid #CBD5E1; }
.aqr-btn-ghost:hover:not(:disabled) { background: #F1F5F9; }
.aqr-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
.aqr-btn-grant { background: #10B981; color: white; border: none; width: 100%; padding: 11px 16px; font-size: 14px; }
.aqr-btn-grant:hover:not(:disabled) { background: #059669; }
.aqr-btn-grant:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
