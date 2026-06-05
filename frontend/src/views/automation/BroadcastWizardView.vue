<!--
  Broadcast Wizard 4-step — Route /marketing/broadcasts/tao-moi
  Đợt 1 2026-06-05.
  Step 1 Đối tượng (4 sub-tabs) → Step 2 Nội dung (chọn block) → Step 3 Lịch gửi → Step 4 Preview & Gửi
-->
<template>
  <div class="mbw-page">
    <div class="container">
      <div class="crumb">
        <a href="#" @click.prevent="goto('/marketing/broadcasts')">Marketing</a>
        <span class="sep">/</span>
        <a href="#" @click.prevent="goto('/marketing/broadcasts')">Broadcasts</a>
        <span class="sep">/</span>
        <span class="current">Tạo Broadcast mới</span>
      </div>
      <div class="topbar">
        <div class="left">
          <h1>📢 Tạo Broadcast mới</h1>
          <p class="sub">Wizard 4 bước · Bước {{ step }}/4</p>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" @click="goto('/marketing/broadcasts')">✕ Huỷ</button>
        </div>
      </div>

      <!-- Stepper -->
      <div class="wizard-stepper">
        <div v-for="(s, i) in steps" :key="i" class="step" :class="{ active: step === i+1, done: step > i+1 }">
          <div class="step-num">{{ step > i+1 ? '✓' : i+1 }}</div>
          <div class="step-label">{{ s }}</div>
        </div>
      </div>

      <div class="wizard-body">
        <div class="wizard-main">
          <!-- ── Step 1 Đối tượng ─────────────────────────────────────── -->
          <div v-if="step === 1">
            <h3>Chọn cách lấy danh sách khách hàng</h3>
            <p class="hint">Em chọn 1 trong 4 cách dưới, hệ thống sẽ lấy danh sách KH tương ứng để gửi.</p>

            <div class="sub-tabs">
              <button class="sub-tab" :class="{ active: audKind === 'customer-list' }" @click="setKind('customer-list')">📁 Tệp KH</button>
              <button class="sub-tab" :class="{ active: audKind === 'tag' }" @click="setKind('tag')">🏷 Tag CRM</button>
              <button class="sub-tab" :class="{ active: audKind === 'preset-segment' }" @click="setKind('preset-segment')">⚡ Pre-set</button>
              <button class="sub-tab" disabled title="Đợt 2">🔧 Filter Builder</button>
            </div>

            <!-- customer-list -->
            <div v-if="audKind === 'customer-list'">
              <label class="form-label">Chọn tệp khách hàng</label>
              <select class="form-input" v-model="customerListId">
                <option value="">— chọn tệp —</option>
                <option v-for="l in lists" :key="l.id" :value="l.id">{{ l.iconEmoji || '📁' }} {{ l.name }} ({{ l.hasZaloEntries }}/{{ l.totalEntries }} có Zalo)</option>
              </select>
              <p class="hint">Chỉ hiển thị tệp đang processing/done. Sau khi gửi, KH chưa kết bạn sẽ skip.</p>
            </div>

            <!-- tag -->
            <div v-if="audKind === 'tag'">
              <label class="form-label">Chọn tag CRM</label>
              <div class="tag-grid">
                <span v-for="t in tags" :key="t.id" class="tag-chip" :class="{ selected: selectedTagIds.includes(t.id) }" @click="toggleTag(t.id)">
                  {{ t.emoji || '🏷' }} {{ t.name }} <small>({{ t.usageCount }})</small>
                </span>
              </div>
              <p v-if="tags.length === 0" class="hint">Chưa có tag CRM nào — vào /settings/crm/tags-v2 tạo.</p>
              <div class="match-toggle">
                <label><input type="radio" v-model="tagMatch" value="any"> Bất kỳ tag (OR)</label>
                <label><input type="radio" v-model="tagMatch" value="all"> Phải có TẤT CẢ (AND)</label>
              </div>
            </div>

            <!-- preset-segment -->
            <div v-if="audKind === 'preset-segment'">
              <label class="form-label">Chọn pre-set segment</label>
              <div class="preset-grid">
                <div v-for="p in presets" :key="p.key" class="preset-card" :class="{ selected: selectedPreset === p.key }" @click="selectedPreset = p.key">
                  <div class="preset-head">{{ p.emoji }} {{ p.label }}</div>
                  <div class="preset-desc">{{ p.description }}</div>
                </div>
              </div>
            </div>

            <div class="preview-result" v-if="previewData">
              <strong>{{ previewData.friendableRecipients }} KH</strong> sẽ nhận tin
              <small>(tổng {{ previewData.totalResolved }} resolved, skip {{ previewData.nonFriendableSkipped + previewData.skipReasons.total }}: {{ previewData.skipReasons.noZalo }} không Zalo, {{ previewData.skipReasons.blocked }} bị chặn)</small>
            </div>
            <button class="btn btn-sm" @click="runPreview" :disabled="previewing">{{ previewing ? '⏳ Đang đếm…' : '🔍 Đếm KH' }}</button>
          </div>

          <!-- ── Step 2 Nội dung (chọn Block) ─────────────────────────── -->
          <div v-if="step === 2">
            <h3>Chọn Khối nội dung tin nhắn</h3>
            <p class="hint">Broadcast dùng lại Khối <code>send_message</code> đã có. Chưa có Khối → vào /marketing/blocks tạo.</p>
            <label class="form-label">Khối nội dung</label>
            <select class="form-input" v-model="blockId">
              <option value="">— chọn khối —</option>
              <option v-for="b in blocks" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
            <div v-if="selectedBlock" class="sample-card">
              <strong>Preview Variant 1:</strong>
              <pre>{{ (selectedBlock.content as any)?.textVariants?.[0] || '—' }}</pre>
              <small>3 biến hỗ trợ: <code>{gender}</code> <code>{name}</code> <code>{sale}</code></small>
            </div>
          </div>

          <!-- ── Step 3 Lịch gửi ────────────────────────────────────── -->
          <div v-if="step === 3">
            <h3>Khi nào gửi?</h3>
            <div class="radio-grid">
              <div class="radio-card" :class="{ selected: scheduleKind === 'now' }" @click="scheduleKind = 'now'">
                <div class="radio-head">⚡ Gửi ngay</div>
                <div class="radio-desc">Bắt đầu worker ngay sau khi bấm "Gửi"</div>
              </div>
              <div class="radio-card" :class="{ selected: scheduleKind === 'scheduled' }" @click="scheduleKind = 'scheduled'">
                <div class="radio-head">📅 Hẹn lịch 1 lần</div>
                <div class="radio-desc">Chọn ngày + giờ cụ thể</div>
              </div>
            </div>
            <div v-if="scheduleKind === 'scheduled'" style="margin-top:14px;">
              <label class="form-label">Giờ gửi</label>
              <input type="datetime-local" class="form-input" v-model="scheduledAt">
            </div>
            <hr style="margin:20px 0;">
            <label class="form-label">Giờ gửi cho phép (Asia/Ho_Chi_Minh)</label>
            <div class="hour-row">
              <input type="number" class="form-input hour-input" v-model.number="hourStart" min="0" max="23"> →
              <input type="number" class="form-input hour-input" v-model.number="hourEnd" min="1" max="24">
              <span class="hint" style="margin-left:8px;">Tin ngoài giờ tự hoãn sang sáng hôm sau.</span>
            </div>
            <label class="form-label" style="margin-top:14px;">Cap mỗi nick/ngày</label>
            <input type="number" class="form-input hour-input" v-model.number="nickDayCap" min="50" max="500">
            <span class="hint" style="margin-left:8px;">Mặc định 300. Nick hết cap → rotate nick khác.</span>
            <label class="form-label" style="margin-top:14px;">Delay giữa các tin (giây)</label>
            <div class="hour-row">
              <input type="number" class="form-input hour-input" v-model.number="delayMinSec" min="1" max="60"> →
              <input type="number" class="form-input hour-input" v-model.number="delayMaxSec" min="2" max="60">
              <span class="hint" style="margin-left:8px;">Random trong khoảng. Càng chậm càng an toàn Zalo flag.</span>
            </div>
          </div>

          <!-- ── Step 4 Preview + Gửi ─────────────────────────────────── -->
          <div v-if="step === 4">
            <h3>Kiểm tra lần cuối</h3>
            <div class="summary-card">
              <label class="form-label">Đặt tên broadcast</label>
              <input class="form-input" v-model="bcName" placeholder="VD: Khuyến mãi cuối tháng 6">
              <hr style="margin:14px 0;">
              <div class="summary-row"><span>Đối tượng</span><strong>{{ audSummary }}</strong></div>
              <div class="summary-row"><span>Sẽ nhận tin</span><strong>{{ previewData?.friendableRecipients || '?' }} KH</strong></div>
              <div class="summary-row"><span>Khối nội dung</span><strong>{{ selectedBlock?.name || '—' }}</strong></div>
              <div class="summary-row"><span>Lịch gửi</span><strong>{{ scheduleKind === 'now' ? '⚡ Gửi ngay' : '📅 ' + scheduledAt }}</strong></div>
              <div class="summary-row"><span>Window</span><strong>{{ hourStart }}:00 → {{ hourEnd }}:00 VN</strong></div>
              <div class="summary-row"><span>Throttle</span><strong>{{ delayMinSec }}-{{ delayMaxSec }}s/KH · cap {{ nickDayCap }}/nick</strong></div>
            </div>
            <p v-if="saveError" class="error-msg">{{ saveError }}</p>
          </div>
        </div>

        <div class="wizard-side">
          <div class="preview-pane">
            <div class="preview-label">Bước {{ step }}/4 · Đối tượng</div>
            <div class="preview-count">{{ previewData?.friendableRecipients || '—' }} KH</div>
            <div class="preview-sub" v-if="previewData">
              Skip {{ previewData.nonFriendableSkipped + previewData.skipReasons.total }} KH
              ({{ previewData.skipReasons.noZalo }} không Zalo, {{ previewData.skipReasons.blocked }} bị chặn, {{ previewData.nonFriendableSkipped }} chưa kết bạn)
            </div>
          </div>
        </div>
      </div>

      <div class="wizard-footer">
        <button class="btn" :disabled="step === 1" @click="step--">← Quay lại</button>
        <div class="step-info">{{ stepInfo }}</div>
        <button v-if="step < 4" class="btn btn-primary" @click="nextStep" :disabled="!canNext">Tiếp tục →</button>
        <button v-if="step === 4" class="btn btn-primary" @click="onSubmit" :disabled="!canSubmit || saving">{{ saving ? '⏳ Đang gửi…' : '🚀 Lưu & ' + (scheduleKind === 'now' ? 'Gửi ngay' : 'Hẹn lịch') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  createBroadcast, startBroadcast, previewUnsaved,
  listPresetSegments, listCustomerListsForBroadcast, listTagsForBroadcast,
  type SegmentSpec, type PresetSegmentMeta, type CustomerListSummary, type TagSummary, type PreviewUnsavedResult,
} from '@/api/automation/broadcasts';
import { listBlocks } from '@/api/automation/blocks';
import type { Block } from '@/api/automation/types';

const router = useRouter();
const steps = ['Đối tượng', 'Nội dung', 'Lịch gửi', 'Xem trước & Gửi'];
const step = ref(1);

// Audience state
type AudKind = 'customer-list' | 'tag' | 'preset-segment';
const audKind = ref<AudKind>('customer-list');
const customerListId = ref('');
const selectedTagIds = ref<string[]>([]);
const tagMatch = ref<'any' | 'all'>('any');
const selectedPreset = ref('');

// Data lookups
const lists = ref<CustomerListSummary[]>([]);
const tags = ref<TagSummary[]>([]);
const presets = ref<PresetSegmentMeta[]>([]);
const blocks = ref<Block[]>([]);

// Preview
const previewData = ref<PreviewUnsavedResult | null>(null);
const previewing = ref(false);

// Content
const blockId = ref('');
const selectedBlock = computed(() => blocks.value.find((b) => b.id === blockId.value));

// Schedule
const scheduleKind = ref<'now' | 'scheduled'>('now');
const scheduledAt = ref('');
const hourStart = ref(6);
const hourEnd = ref(22);
const nickDayCap = ref(300);
const delayMinSec = ref(3);
const delayMaxSec = ref(10);

// Save
const bcName = ref('');
const saving = ref(false);
const saveError = ref('');

function setKind(k: AudKind) { audKind.value = k; previewData.value = null; }
function toggleTag(id: string) {
  const i = selectedTagIds.value.indexOf(id);
  if (i >= 0) selectedTagIds.value.splice(i, 1);
  else selectedTagIds.value.push(id);
  previewData.value = null;
}

function buildSegmentSpec(): SegmentSpec | null {
  if (audKind.value === 'customer-list') {
    if (!customerListId.value) return null;
    return { kind: 'customer-list', listId: customerListId.value };
  }
  if (audKind.value === 'tag') {
    if (selectedTagIds.value.length === 0) return null;
    return { kind: 'tag', tagIds: selectedTagIds.value, match: tagMatch.value };
  }
  if (audKind.value === 'preset-segment') {
    if (!selectedPreset.value) return null;
    return { kind: 'preset-segment', presetKey: selectedPreset.value };
  }
  return null;
}

const audSummary = computed(() => {
  if (audKind.value === 'customer-list') {
    const l = lists.value.find((x) => x.id === customerListId.value);
    return l ? `📁 ${l.name}` : '—';
  }
  if (audKind.value === 'tag') return `🏷 ${selectedTagIds.value.length} tag (${tagMatch.value})`;
  if (audKind.value === 'preset-segment') {
    const p = presets.value.find((x) => x.key === selectedPreset.value);
    return p ? `⚡ ${p.label}` : '—';
  }
  return '—';
});

const canNext = computed(() => {
  if (step.value === 1) return !!buildSegmentSpec();
  if (step.value === 2) return !!blockId.value;
  if (step.value === 3) return scheduleKind.value === 'now' || !!scheduledAt.value;
  return true;
});

const canSubmit = computed(() => !!bcName.value.trim() && !!previewData.value && previewData.value.friendableRecipients > 0);

const stepInfo = computed(() => {
  if (step.value === 1 && previewData.value) return `${previewData.value.friendableRecipients} KH sẽ nhận tin`;
  if (step.value === 2 && selectedBlock.value) return `Khối: ${selectedBlock.value.name}`;
  if (step.value === 3) return `${scheduleKind.value === 'now' ? 'Gửi ngay' : 'Hẹn ' + scheduledAt.value} · ${delayMinSec.value}-${delayMaxSec.value}s/KH`;
  return '';
});

async function runPreview() {
  const spec = buildSegmentSpec();
  if (!spec) return;
  previewing.value = true;
  try {
    previewData.value = await previewUnsaved({ segmentSpec: spec, sampleSize: 5 });
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Lỗi preview');
  } finally {
    previewing.value = false;
  }
}

async function nextStep() {
  if (step.value === 1 && !previewData.value) {
    await runPreview();
  }
  step.value++;
}

function goto(p: string) { router.push(p); }

async function onSubmit() {
  saveError.value = '';
  saving.value = true;
  try {
    const segmentSpec = buildSegmentSpec();
    if (!segmentSpec) throw new Error('Đối tượng chưa hợp lệ');
    const pacing = {
      randomDelayBetweenSends: { min: delayMinSec.value * 1000, max: delayMaxSec.value * 1000 },
      hourStart: hourStart.value,
      hourEnd: hourEnd.value,
      nickDayCap: nickDayCap.value,
      excludeBlocked: true,
    };
    const bc = await createBroadcast({
      name: bcName.value.trim(),
      blockId: blockId.value,
      segmentSpec,
      scheduleKind: scheduleKind.value,
      scheduledAt: scheduleKind.value === 'scheduled' ? new Date(scheduledAt.value).toISOString() : undefined,
      pacing,
    });
    // If "now" → also start immediately
    if (scheduleKind.value === 'now') {
      await startBroadcast(bc.id);
    }
    router.push(`/marketing/broadcasts/${bc.id}`);
  } catch (e: any) {
    saveError.value = e?.response?.data?.error || e?.message || 'Lỗi tạo broadcast';
  } finally {
    saving.value = false;
  }
}

watch([audKind, customerListId, selectedTagIds, selectedPreset, tagMatch], () => { previewData.value = null; }, { deep: true });

onMounted(async () => {
  const [l, t, p, b] = await Promise.all([
    listCustomerListsForBroadcast(),
    listTagsForBroadcast(),
    listPresetSegments(),
    listBlocks({ limit: 200 }),
  ]);
  lists.value = l;
  tags.value = t;
  presets.value = p;
  blocks.value = b.filter((bk) => bk.actionType === 'send_message' && !bk.archivedAt);
});
</script>

<style scoped>
.mbw-page {
  --mbw-brand: #1786be;
  --mbw-brand-soft: #e4f1f8;
  --mbw-ink: #141a24;
  --mbw-text-2: #475066;
  --mbw-text-3: #6b7488;
  --mbw-line: #e7eaf0;
  --mbw-line-strong: #cdd4e0;
  --mbw-surface-2: #f7f9fc;
  --mbw-surface-3: #f1f4f9;
  --mbw-success: #12b76a;
  --mbw-warning-soft: #fdf3e2;
  --mbw-danger: #f04438;
  --mbw-purple: #6554c0;
  --mbw-shadow-1: 0 1px 2px rgba(20, 26, 36, 0.05);
  min-height: 100vh;
  background: var(--mbw-surface-2);
  padding: 24px;
  font-size: 13px;
  color: var(--mbw-ink);
}
.container { max-width: 1200px; margin: 0 auto; }
.crumb { font-size: 12px; color: var(--mbw-text-3); margin-bottom: 8px; }
.crumb a { color: var(--mbw-text-3); text-decoration: none; }
.crumb .sep { margin: 0 6px; }
.crumb .current { color: var(--mbw-text-2); font-weight: 500; }
.topbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; }
.topbar h1 { margin: 0 0 4px 0; font-size: 22px; font-weight: 700; }
.topbar .sub { margin: 0; font-size: 12px; color: var(--mbw-text-3); }
.actions { display: flex; gap: 8px; }
.btn { padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; border: 1px solid var(--mbw-line-strong); background: white; color: var(--mbw-ink); cursor: pointer; }
.btn:hover { background: var(--mbw-surface-3); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--mbw-brand); color: white; border-color: var(--mbw-brand); }
.btn-primary:hover { background: #0f6fa0; }
.btn-ghost { background: transparent; border-color: var(--mbw-line); color: var(--mbw-text-2); }
.btn-sm { padding: 6px 10px; font-size: 12px; }

.wizard-stepper { display: flex; align-items: center; padding: 16px 0; margin-bottom: 20px; border-bottom: 1px solid var(--mbw-line); }
.step { display: flex; align-items: center; gap: 8px; flex: 1; }
.step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--mbw-surface-3); color: var(--mbw-text-3); font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.step.active .step-num { background: var(--mbw-brand); color: white; }
.step.done .step-num { background: var(--mbw-success); color: white; }
.step-label { font-size: 13px; color: var(--mbw-text-3); font-weight: 500; }
.step.active .step-label { color: var(--mbw-brand); font-weight: 600; }

.wizard-body { display: grid; grid-template-columns: 1fr 320px; gap: 20px; margin-bottom: 20px; }
.wizard-main { background: white; border: 1px solid var(--mbw-line); border-radius: 6px; box-shadow: var(--mbw-shadow-1); padding: 20px; }
.wizard-main h3 { margin: 0 0 4px 0; font-size: 16px; font-weight: 700; }
.hint { margin: 0 0 16px 0; font-size: 12px; color: var(--mbw-text-3); }
.error-msg { color: var(--mbw-danger); font-size: 13px; padding: 8px 12px; background: #fdeceb; border-radius: 4px; }

.sub-tabs { display: flex; gap: 2px; background: var(--mbw-surface-3); padding: 4px; border-radius: 8px; margin-bottom: 16px; }
.sub-tab { flex: 1; padding: 8px 14px; border: none; background: transparent; border-radius: 5px; font-size: 12px; font-weight: 500; color: var(--mbw-text-3); cursor: pointer; }
.sub-tab.active { background: white; color: var(--mbw-brand); font-weight: 600; box-shadow: var(--mbw-shadow-1); }
.sub-tab:disabled { opacity: 0.5; cursor: not-allowed; }

.form-label { display: block; font-size: 12px; font-weight: 600; color: var(--mbw-text-2); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.form-input { width: 100%; padding: 8px 12px; border: 1px solid var(--mbw-line-strong); border-radius: 6px; font-size: 13px; background: white; font-family: inherit; box-sizing: border-box; }
.form-input:focus { outline: none; border-color: var(--mbw-brand); }
.hour-input { width: 80px; display: inline-block; }
.hour-row { display: flex; align-items: center; gap: 8px; }

.tag-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; background: var(--mbw-surface-3); border-radius: 6px; min-height: 80px; }
.tag-chip { padding: 5px 10px; background: white; border: 1px solid var(--mbw-line); border-radius: 14px; font-size: 12px; cursor: pointer; }
.tag-chip.selected { background: var(--mbw-brand); color: white; border-color: var(--mbw-brand); }
.match-toggle { margin-top: 12px; display: flex; gap: 16px; font-size: 13px; }

.preset-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.preset-card { padding: 12px 14px; border: 2px solid var(--mbw-line); border-radius: 6px; background: white; cursor: pointer; }
.preset-card:hover { border-color: var(--mbw-brand); }
.preset-card.selected { border-color: var(--mbw-brand); background: var(--mbw-brand-soft); }
.preset-head { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.preset-desc { font-size: 11px; color: var(--mbw-text-3); }

.radio-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.radio-card { padding: 14px 16px; border: 2px solid var(--mbw-line); border-radius: 6px; background: white; cursor: pointer; }
.radio-card:hover { border-color: var(--mbw-brand); }
.radio-card.selected { border-color: var(--mbw-brand); background: var(--mbw-brand-soft); }
.radio-head { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.radio-desc { font-size: 11px; color: var(--mbw-text-3); }

.preview-result { background: var(--mbw-brand-soft); border: 1px solid #bbddff; border-radius: 6px; padding: 10px 14px; margin: 14px 0; font-size: 13px; }

.sample-card { background: var(--mbw-surface-3); border-radius: 6px; padding: 12px 14px; margin-top: 14px; font-size: 12px; }
.sample-card pre { margin: 6px 0; white-space: pre-wrap; font-family: inherit; font-size: 12px; }
.summary-card { background: var(--mbw-surface-3); border-radius: 6px; padding: 16px; }
.summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid var(--mbw-line); }
.summary-row:last-child { border-bottom: none; }
.summary-row span { color: var(--mbw-text-3); }

.wizard-side { display: flex; flex-direction: column; gap: 14px; }
.preview-pane { background: var(--mbw-brand-soft); border: 1px solid #bbddff; border-radius: 6px; padding: 14px 16px; }
.preview-label { font-size: 11px; color: var(--mbw-text-3); margin-bottom: 6px; font-weight: 600; text-transform: uppercase; }
.preview-count { font-size: 28px; font-weight: 700; color: var(--mbw-brand); margin-bottom: 6px; }
.preview-sub { font-size: 11px; color: var(--mbw-text-2); }

.wizard-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-top: 1px solid var(--mbw-line); background: var(--mbw-surface-2); position: sticky; bottom: 0; }
.step-info { font-size: 12px; color: var(--mbw-text-3); }
</style>
