<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  BroadcastsView — Broadcast tự động (Community).
  Wizard 4 bước (Đối tượng → Nội dung → Nick & lịch → Kiểm tra) + trang chi tiết.
  DRY-RUN (VITE_MARKETING_DRY_RUN, mặc định BẬT): chỉ tạo NHÁP (status=paused) —
  cron chỉ quét job 'active' nên KHÔNG gửi Zalo thật; nút kích hoạt thật bị KHOÁ.
  Backend: /api/v1/broadcast-jobs (+ audience-count dry-run + worker cron chống block).
-->
<template>
  <div class="bc-view">
    <div class="mkt-top">
      <div>
        <div class="mtt">Broadcast tự động</div>
        <div class="mts">
          Gửi tin hàng loạt tới <b>Tệp khách hàng</b> / <b>Bạn bè</b> theo lịch. Tin <b>gửi rải</b> + tôn trọng <b>trần tin/ngày của nick</b> để chống block.
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="openWizard()">
          <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo broadcast
        </button>
      </div>
    </div>

    <div v-if="dryRun" class="bc-dry">
      <v-icon size="15">mdi-shield-alert-outline</v-icon>
      <b>Chế độ an toàn (dry-run) đang bật</b> — broadcast tạo ra là <b>nháp (tạm dừng)</b>, worker sẽ KHÔNG gửi Zalo thật. Nút “Chạy ngay” bị khoá.
    </div>

    <div class="bc-body">
      <div v-if="loading" class="bc-empty">Đang tải…</div>
      <div v-else-if="jobs.length === 0" class="bc-empty">
        <v-icon size="40">mdi-bullhorn-outline</v-icon>
        <p>Chưa có broadcast nào. Bấm <b>Tạo broadcast</b> để bắt đầu.</p>
      </div>

      <div v-for="job in jobs" :key="job.id" class="bc-card" :class="'st-' + job.status">
        <div class="bc-card-main" @click="openDetail(job)">
          <div class="bc-card-head">
            <span class="bc-name">{{ job.name }}</span>
            <span class="bc-badge" :class="'b-' + job.status">{{ statusLabel(job.status) }}</span>
          </div>
          <div class="bc-meta">
            <span v-if="job.sourceType === 'friends'"><v-icon size="14">mdi-account-heart-outline</v-icon> Bạn bè đã kết bạn của nick</span>
            <span v-else><v-icon size="14">mdi-format-list-bulleted</v-icon> {{ job.list?.name ?? 'Tệp đã xoá' }}
              <template v-if="job.list"> ({{ job.list.hasZaloEntries }} có Zalo)</template></span>
            <span><v-icon size="14">mdi-account-circle-outline</v-icon> {{ job.nick?.displayName ?? job.nick?.phone ?? '—' }}</span>
            <span><v-icon size="14">mdi-clock-outline</v-icon> {{ scheduleLabel(job) }}</span>
            <span v-if="job.nextRunAt"><v-icon size="14">mdi-calendar-arrow-right</v-icon> Lần tới: {{ fmtDate(job.nextRunAt) }}</span>
          </div>
          <div v-if="job.contentBlocks?.length" class="bc-msg">
            <v-icon size="14">mdi-shuffle-variant</v-icon> Xoay vòng {{ job.contentBlocks.length }} khối
          </div>
          <div v-else class="bc-msg" :title="job.messageText">{{ job.messageText }}</div>
          <div v-if="job.latestRun" class="bc-run">
            <span class="run-badge" :class="'r-' + job.latestRun.status">{{ job.latestRun.status === 'running' ? 'Đang gửi' : 'Lần gần nhất' }}</span>
            <template v-if="job.latestRun.queuedCount">📋 {{ job.latestRun.sentCount + job.latestRun.failedCount + job.latestRun.skippedCount }}/{{ job.latestRun.queuedCount }} · </template>
            ✅ {{ job.latestRun.sentCount }} · ❌ {{ job.latestRun.failedCount }} · ⏭ {{ job.latestRun.skippedCount }}
          </div>
        </div>
        <div class="bc-card-actions">
          <button class="btn btn-ghost btn-sm" title="Chi tiết" @click="openDetail(job)"><v-icon size="16">mdi-open-in-new</v-icon></button>
          <button v-if="job.status === 'active'" class="btn btn-ghost btn-sm" title="Tạm dừng" @click="setStatus(job, 'paused')"><v-icon size="16">mdi-pause</v-icon></button>
          <button v-if="job.status === 'paused'" class="btn btn-ghost btn-sm" title="Tiếp tục" @click="setStatus(job, 'active')"><v-icon size="16">mdi-play</v-icon></button>
          <button v-if="job.status !== 'done' && !dryRun" class="btn btn-ghost btn-sm" title="Chạy ngay" @click="runNow(job)"><v-icon size="16">mdi-send</v-icon></button>
          <button v-else-if="job.status !== 'done'" class="btn btn-ghost btn-sm" title="Chạy ngay (khoá — dry-run)" disabled><v-icon size="16">mdi-send-lock-outline</v-icon></button>
          <button class="btn btn-ghost btn-sm danger" title="Xoá" @click="removeJob(job)"><v-icon size="16">mdi-trash-can-outline</v-icon></button>
        </div>
      </div>
    </div>

    <!-- ============ WIZARD 4 BƯỚC ============ -->
    <div v-if="wizard.open" class="bc-overlay" @click.self="closeWizard">
      <div class="bc-modal bc-modal-wide">
        <div class="bc-modal-head">
          <b>Tạo broadcast</b>
          <button class="btn-x" @click="closeWizard"><v-icon size="18">mdi-close</v-icon></button>
        </div>

        <!-- Stepper -->
        <div class="wz-steps">
          <div v-for="s in STEPS" :key="s.n" class="wz-step" :class="{ on: wizard.step === s.n, done: wizard.step > s.n }">
            <span class="wz-num">{{ wizard.step > s.n ? '✓' : s.n }}</span> {{ s.label }}
          </div>
        </div>

        <!-- ===== Bước 1 — Đối tượng ===== -->
        <div v-if="wizard.step === 1" class="wz-body">
          <label class="f-label">Tên broadcast</label>
          <input v-model="form.name" class="f-input" placeholder="VD: Khuyến mãi tháng 7" />

          <label class="f-label">Nick Zalo gửi</label>
          <select v-model="form.zaloAccountId" class="f-input" @change="onNickChange">
            <option value="" disabled>— chọn nick —</option>
            <option v-for="n in nicks" :key="n.id" :value="n.id">{{ n.displayName || n.phone }} {{ n.status !== 'connected' ? '(mất kết nối)' : '' }}</option>
          </select>

          <label class="f-label">Nguồn người nhận</label>
          <div class="f-tabs">
            <button type="button" class="f-tab" :class="{ on: form.sourceType === 'friends' }" @click="setSource('friends')"><v-icon size="14">mdi-account-heart-outline</v-icon> Bạn bè đã kết bạn</button>
            <button type="button" class="f-tab" :class="{ on: form.sourceType === 'customer_list' }" @click="setSource('customer_list')"><v-icon size="14">mdi-format-list-bulleted</v-icon> Tệp khách hàng</button>
          </div>

          <template v-if="form.sourceType === 'customer_list'">
            <label class="f-label" style="margin-top:8px">Tệp khách hàng</label>
            <select v-model="form.customerListId" class="f-input" @change="audience = null">
              <option value="" disabled>— chọn tệp —</option>
              <option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }} ({{ l.hasZaloEntries }} có Zalo)</option>
            </select>
            <div class="f-note warn" style="margin-top:6px"><v-icon size="15">mdi-alert-outline</v-icon> Tệp SĐT có thể gồm <b>người chưa kết bạn</b> — tin dễ vào hộp “người lạ”/bị chặn.</div>
          </template>
          <template v-else>
            <div class="f-note" style="margin-top:8px"><v-icon size="15">mdi-shield-check-outline</v-icon> Gửi tới <b>bạn bè đã kết bạn</b> của nick — an toàn hơn.
              <template v-if="form.zaloAccountId"> <b>{{ friendCount === null ? '…' : friendCount.toLocaleString('vi-VN') }}</b> bạn bè.</template>
            </div>
          </template>

          <div style="margin-top:10px">
            <button type="button" class="btn btn-ghost btn-sm" :disabled="counting || !canCount" @click="countAudience">
              <v-icon size="16">mdi-calculator-variant-outline</v-icon> {{ counting ? 'Đang đếm…' : 'Đếm người nhận khả dụng' }}
            </button>
          </div>
          <div v-if="audienceError" class="f-note warn" style="margin-top:6px">{{ audienceError }}</div>
          <div v-if="audience" class="wz-audience">
            <div class="wz-a-row"><span>Tổng trong tệp</span><b>{{ audience.total.toLocaleString('vi-VN') }}</b></div>
            <div class="wz-a-row"><span>Sẽ gửi lần chạy này</span><b class="ok">{{ audience.willSend.toLocaleString('vi-VN') }}</b></div>
            <template v-if="form.sourceType === 'customer_list'">
              <div class="wz-a-row"><span>Có Zalo (hợp lệ)</span><b>{{ audience.breakdown.hasZalo ?? 0 }}</b></div>
              <div class="wz-a-row"><span>UID sẵn theo nick</span><b>{{ audience.breakdown.uidReady ?? 0 }}</b></div>
              <div class="wz-a-row"><span>Cần tra UID lúc gửi</span><b>{{ audience.breakdown.needLookup ?? 0 }}</b></div>
              <div class="wz-a-row skip"><span>Bỏ qua — không Zalo</span><b>{{ audience.breakdown.skipNoZalo ?? 0 }}</b></div>
              <div class="wz-a-row skip"><span>Bỏ qua — chưa quét</span><b>{{ audience.breakdown.skipUnknown ?? 0 }}</b></div>
            </template>
          </div>
        </div>

        <!-- ===== Bước 2 — Nội dung ===== -->
        <div v-else-if="wizard.step === 2" class="wz-body">
          <div class="f-tabs">
            <button type="button" class="f-tab" :class="{ on: form.contentMode === 'text' }" @click="form.contentMode = 'text'">Gõ tay</button>
            <button type="button" class="f-tab" :class="{ on: form.contentMode === 'blocks' }" @click="onSelectBlocksMode"><v-icon size="14">mdi-shuffle-variant</v-icon> Khối nội dung (xoay vòng)</button>
          </div>

          <template v-if="form.contentMode === 'text'">
            <label class="f-label" style="margin-top:10px">Biến (backend render): <code v-pre>{{ten}}</code> tên · <code v-pre>{{sdt}}</code> SĐT</label>
            <div class="f-vars">
              <button v-for="v in BC_VARS" :key="v" type="button" class="f-var" @click="insertVar(v)">{{ v }}</button>
              <button v-if="templates.length" type="button" class="f-var alt" @click="showTplPick = !showTplPick">Chèn từ mẫu…</button>
            </div>
            <div v-if="showTplPick" class="f-tpl-pick">
              <button v-for="t in templates" :key="t.id" type="button" class="f-tpl" @click="useTemplate(t)">{{ t.name }} <span v-if="t.shortcut">/{{ t.shortcut }}</span></button>
              <div v-if="templates.length === 0" class="f-hint">Chưa có mẫu tin nhắn.</div>
            </div>
            <textarea ref="contentEl" v-model="form.messageText" class="f-input f-area" rows="4" placeholder="Chào {{ten}}, bên em có ưu đãi…"></textarea>
            <div v-if="unknownVars.length" class="f-note warn" style="margin-top:6px"><v-icon size="15">mdi-alert</v-icon> Biến không render được: {{ unknownVarsLabel }} — sẽ gửi nguyên văn. Chỉ dùng {{ varsHint }}.</div>
            <div class="f-preview"><span class="f-preview-lbl">Xem trước (KH mẫu “Nguyễn Văn An”):</span> {{ previewText || '(trống)' }}</div>
          </template>
          <template v-else>
            <div class="f-hint" style="margin:10px 0 6px">Mỗi tin lấy 1 khối kế tiếp — tránh gửi giống hệt. Tạo ở <RouterLink to="/marketing/content-blocks">Khối nội dung</RouterLink>.</div>
            <div v-if="contentBlocks.length === 0" class="bc-empty" style="padding:16px 0">Chưa có khối nội dung.</div>
            <div v-else class="f-block-list">
              <label v-for="b in contentBlocks" :key="b.id" class="f-block-item">
                <input type="checkbox" :checked="form.contentBlockIds.includes(b.id)" @change="toggleBlock(b.id)" />
                <div class="f-block-info">
                  <div class="f-block-name"><span v-if="form.contentBlockIds.includes(b.id)" class="f-block-order">{{ form.contentBlockIds.indexOf(b.id) + 1 }}</span>{{ b.name }}</div>
                  <div class="f-block-text">{{ b.messageText }}</div>
                </div>
              </label>
            </div>
          </template>
          <div class="f-hint" style="margin-top:8px">Ảnh/media: ngoài phạm vi wizard này (dùng Khối nội dung có ảnh nếu cần).</div>
        </div>

        <!-- ===== Bước 3 — Nick & lịch ===== -->
        <div v-else-if="wizard.step === 3" class="wz-body">
          <div class="f-note" :class="{ warn: !nickOnline }"><v-icon size="15">{{ nickOnline ? 'mdi-check-circle-outline' : 'mdi-alert-outline' }}</v-icon>
            Nick: <b>{{ selectedNick?.displayName || selectedNick?.phone || '—' }}</b> — {{ nickOnline ? 'đang kết nối' : 'MẤT KẾT NỐI (worker chờ tới khi online)' }}
          </div>

          <label class="f-label">Lịch gửi</label>
          <div class="f-tabs">
            <button v-for="t in scheduleTypes" :key="t.value" class="f-tab" :class="{ on: form.scheduleType === t.value }" @click="form.scheduleType = t.value">{{ t.label }}</button>
          </div>
          <div class="f-row">
            <div v-if="form.scheduleType === 'once'" class="f-col">
              <label class="f-label">Ngày giờ gửi</label>
              <input v-model="form.scheduledAtLocal" type="datetime-local" class="f-input" />
            </div>
            <div v-else class="f-col">
              <label class="f-label">Giờ gửi (VN)</label>
              <input v-model="form.timeOfDay" type="time" class="f-input" />
            </div>
            <div v-if="form.scheduleType === 'weekly'" class="f-col f-grow">
              <label class="f-label">Ngày trong tuần</label>
              <div class="f-dows"><button v-for="d in dowOptions" :key="d.value" class="f-dow" :class="{ on: form.daysOfWeek.includes(d.value) }" @click="toggleDow(d.value)">{{ d.label }}</button></div>
            </div>
          </div>

          <label class="f-label">Chống block (tốc độ / quota)</label>
          <div class="f-row">
            <div class="f-col"><label class="f-label">Tối đa tin / lần chạy</label><input v-model.number="form.maxPerRun" type="number" min="1" max="500" class="f-input" /></div>
            <div class="f-col"><label class="f-label">Giãn cách min (giây)</label><input v-model.number="form.delaySecMin" type="number" min="5" class="f-input" /></div>
            <div class="f-col"><label class="f-label">Giãn cách max (giây)</label><input v-model.number="form.delaySecMax" type="number" min="5" class="f-input" /></div>
          </div>
          <div class="f-hint">Retry: tin lỗi có thể gửi lại thủ công ở trang chi tiết (không retry vô hạn — mỗi lần tạo run mới chỉ gồm item lỗi). Trần tin/ngày của nick vẫn gate thêm.</div>
        </div>

        <!-- ===== Bước 4 — Kiểm tra & xác nhận ===== -->
        <div v-else class="wz-body">
          <div v-if="counting" class="bc-empty">Đang tính lại người nhận…</div>
          <template v-else-if="audience">
            <div class="wz-review">
              <div class="wz-rev-col">
                <div class="wz-rev-h">Người nhận</div>
                <div class="wz-a-row"><span>Tổng trong tệp</span><b>{{ audience.total.toLocaleString('vi-VN') }}</b></div>
                <div class="wz-a-row"><span>Sẽ gửi lần chạy này</span><b class="ok">{{ audience.willSend.toLocaleString('vi-VN') }}</b></div>
                <div class="wz-a-row skip"><span>Bị skip</span><b>{{ skippedTotal.toLocaleString('vi-VN') }}</b></div>
                <template v-if="form.sourceType === 'customer_list'">
                  <div class="wz-a-sub">— không Zalo: {{ audience.breakdown.skipNoZalo ?? 0 }} · chưa quét: {{ audience.breakdown.skipUnknown ?? 0 }} · cần tra UID: {{ audience.breakdown.needLookup ?? 0 }}</div>
                </template>
              </div>
              <div class="wz-rev-col">
                <div class="wz-rev-h">Cấu hình</div>
                <div class="wz-a-row"><span>Nick gửi</span><b>{{ selectedNick?.displayName || selectedNick?.phone }}</b></div>
                <div class="wz-a-row"><span>Lịch</span><b>{{ scheduleLabelForm() }}</b></div>
                <div class="wz-a-row"><span>Tốc độ</span><b>{{ form.maxPerRun }} tin/lần · {{ form.delaySecMin }}-{{ form.delaySecMax }}s</b></div>
                <div class="wz-a-row" :class="{ skip: !audience.quota.enough }"><span>Quota nick hôm nay</span><b>{{ audience.quota.remaining }}/{{ audience.quota.dailyLimit }} còn</b></div>
              </div>
            </div>
            <div class="f-preview" style="margin-top:10px"><span class="f-preview-lbl">Nội dung:</span> {{ contentSummary }}</div>

            <div v-if="riskWarnings.length" class="f-note warn" style="margin-top:10px">
              <div v-for="w in riskWarnings" :key="w"><v-icon size="14">mdi-alert-outline</v-icon> {{ w }}</div>
            </div>

            <label class="wz-confirm"><input type="checkbox" v-model="wizard.confirm" /> Tôi đã kiểm tra người nhận, nội dung và lịch gửi.</label>
            <div v-if="dryRun" class="f-note" style="margin-top:6px"><v-icon size="15">mdi-shield-check-outline</v-icon> Dry-run: sẽ tạo <b>nháp (tạm dừng)</b>. Không gửi Zalo thật. Tắt dry-run + “Chạy ngay” ở chi tiết để gửi thật.</div>
          </template>
          <div v-else class="f-note warn">Chưa tính được người nhận — quay lại Bước 1 và bấm “Đếm người nhận”.</div>
        </div>

        <!-- Footer -->
        <div class="bc-modal-foot">
          <button v-if="wizard.step > 1" class="btn btn-ghost btn-sm" @click="prevStep">← Quay lại</button>
          <span style="flex:1"></span>
          <button class="btn btn-ghost btn-sm" @click="closeWizard">Huỷ</button>
          <button v-if="wizard.step < 4" class="btn btn-primary btn-sm" :disabled="!stepValid" @click="nextStep">Tiếp →</button>
          <button v-else class="btn btn-primary btn-sm" :disabled="creating || !wizard.confirm || !audience" @click="createJob">
            {{ creating ? 'Đang tạo…' : (dryRun ? 'Tạo nháp (dry-run)' : 'Tạo broadcast') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ============ DETAIL DRAWER ============ -->
    <BroadcastDetailDrawer v-if="detail.open" :job-id="detail.jobId" :dry-run="dryRun" @close="detail.open = false" @changed="load" />

    <!-- ============ Media picker (giữ cho tương lai) ============ -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import { marketingDryRunEnabled } from '@/utils/marketingFeatureFlags';
import { findUnknownVars, renderBroadcastPreview, validateWizardStep, buildBroadcastPayload } from '@/utils/broadcast-wizard-logic';
import BroadcastDetailDrawer from '@/components/marketing/BroadcastDetailDrawer.vue';

const { push: toast } = useToast();
const { confirm } = useConfirm();
const route = useRoute();
const dryRun = marketingDryRunEnabled;

interface JobRow {
  id: string; name: string; status: string; messageText: string;
  sourceType: 'customer_list' | 'friends';
  scheduleType: 'once' | 'daily' | 'weekly'; scheduledAt: string | null;
  timeOfDay: string | null; daysOfWeek: number[]; nextRunAt: string | null;
  list: { id: string; name: string; hasZaloEntries: number } | null;
  nick: { id: string; displayName: string | null; phone: string | null; status: string } | null;
  contentBlocks?: Array<{ id: string; name: string }>;
  latestRun: { id: string; status: string; sentCount: number; failedCount: number; skippedCount: number; queuedCount: number } | null;
}
interface ContentBlockRow { id: string; name: string; messageText: string; imageUrl: string | null }
interface TemplateRow { id: string; name: string; shortcut: string | null; content: string }
interface AudienceCount {
  total: number; willSend: number;
  breakdown: { friendsAccepted?: number; hasZalo?: number; skipNoZalo?: number; skipUnknown?: number; uidReady?: number; needLookup?: number };
  quota: { usedToday: number; dailyLimit: number; remaining: number; enough: boolean };
  nickOnline: boolean;
}

const BC_VARS = ['{{ten}}', '{{sdt}}', '{{ten_khach}}', '{{phone}}'];
const STEPS = [
  { n: 1, label: 'Đối tượng' }, { n: 2, label: 'Nội dung' }, { n: 3, label: 'Nick & lịch' }, { n: 4, label: 'Kiểm tra' },
];
const scheduleTypes = [
  { value: 'once' as const, label: 'Gửi 1 lần' }, { value: 'daily' as const, label: 'Hàng ngày' }, { value: 'weekly' as const, label: 'Hàng tuần' },
];
const dowOptions = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' },
  { value: 4, label: 'T5' }, { value: 5, label: 'T6' }, { value: 6, label: 'T7' }, { value: 0, label: 'CN' },
];

const jobs = ref<JobRow[]>([]);
const lists = ref<Array<{ id: string; name: string; hasZaloEntries: number }>>([]);
const nicks = ref<Array<{ id: string; displayName: string | null; phone: string | null; status: string }>>([]);
const contentBlocks = ref<ContentBlockRow[]>([]);
const templates = ref<TemplateRow[]>([]);
const loading = ref(true);
const creating = ref(false);
const counting = ref(false);
const friendCount = ref<number | null>(null);
const audience = ref<AudienceCount | null>(null);
const audienceError = ref('');
const showTplPick = ref(false);
const contentEl = ref<HTMLTextAreaElement | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const wizard = reactive({ open: false, step: 1, confirm: false });
const detail = reactive({ open: false, jobId: '' });

const form = reactive({
  name: '', sourceType: 'friends' as 'customer_list' | 'friends',
  customerListId: '', zaloAccountId: '', messageText: '',
  contentMode: 'text' as 'text' | 'blocks', contentBlockIds: [] as string[],
  scheduleType: 'once' as 'once' | 'daily' | 'weekly',
  scheduledAtLocal: '', timeOfDay: '08:00', daysOfWeek: [] as number[],
  maxPerRun: 50, delaySecMin: 30, delaySecMax: 90,
});

const selectedNick = computed(() => nicks.value.find((n) => n.id === form.zaloAccountId) ?? null);
const nickOnline = computed(() => selectedNick.value?.status === 'connected');
const canCount = computed(() => !!form.zaloAccountId && (form.sourceType === 'friends' || !!form.customerListId));
const skippedTotal = computed(() => audience.value ? Math.max(0, audience.value.total - audience.value.willSend) : 0);

const unknownVars = computed(() => findUnknownVars(form.messageText));
// Nhãn braces dựng trong JS (tránh nested {{...}} trong template — Vue mis-parse).
const unknownVarsLabel = computed(() => unknownVars.value.map((v) => '{{' + v + '}}').join(', '));
const varsHint = BC_VARS.join(' ');
const previewText = computed(() => renderBroadcastPreview(form.messageText));
const contentSummary = computed(() => form.contentMode === 'blocks'
  ? `Xoay vòng ${form.contentBlockIds.length} khối nội dung`
  : (previewText.value || '(trống)'));
const riskWarnings = computed(() => {
  const w: string[] = [];
  if (!audience.value) return w;
  if (!audience.value.nickOnline) w.push('Nick đang mất kết nối — worker sẽ chờ tới khi nick online.');
  if (!audience.value.quota.enough) w.push(`Quota nick không đủ cho ${audience.value.willSend} tin — sẽ tự ngắt khi chạm trần.`);
  if (form.sourceType === 'customer_list' && (audience.value.breakdown.skipUnknown ?? 0) > 0) w.push('Có SĐT chưa quét Zalo — nên “Quét lại Zalo” tệp trước khi gửi.');
  if (form.sourceType === 'customer_list') w.push('Tệp có thể gồm người chưa kết bạn — tin dễ vào hộp “người lạ”/bị chặn.');
  return w;
});

const stepValid = computed(() => validateWizardStep(
  wizard.step, form, { friendCount: friendCount.value, audienceWillSend: audience.value?.willSend ?? null },
));

function setSource(s: 'friends' | 'customer_list'): void { form.sourceType = s; audience.value = null; audienceError.value = ''; }

async function onNickChange(): Promise<void> {
  friendCount.value = null; audience.value = null; audienceError.value = '';
  if (!form.zaloAccountId) return;
  try { const res = await api.get(`/broadcast-jobs/friend-count/${form.zaloAccountId}`); friendCount.value = res.data.count; }
  catch { friendCount.value = 0; }
}

async function countAudience(): Promise<void> {
  if (!canCount.value) return;
  counting.value = true; audienceError.value = '';
  try {
    const res = await api.post('/broadcast-jobs/audience-count', {
      sourceType: form.sourceType,
      customerListId: form.sourceType === 'customer_list' ? form.customerListId : undefined,
      zaloAccountId: form.zaloAccountId, maxPerRun: form.maxPerRun,
    });
    audience.value = res.data;
    if (res.data.willSend === 0) audienceError.value = 'Không có người nhận khả dụng (0 sẽ gửi). Kiểm tra tệp/nick.';
  } catch (err: any) {
    audience.value = null;
    audienceError.value = `Lỗi đếm: ${err?.response?.data?.error ?? 'không đếm được'}`;
  } finally { counting.value = false; }
}

function insertVar(token: string): void {
  const el = contentEl.value;
  if (!el) { form.messageText += token; return; }
  const s = el.selectionStart ?? form.messageText.length, e = el.selectionEnd ?? form.messageText.length;
  form.messageText = form.messageText.slice(0, s) + token + form.messageText.slice(e);
  requestAnimationFrame(() => { el.focus(); const p = s + token.length; el.setSelectionRange(p, p); });
}
function useTemplate(t: TemplateRow): void { form.messageText = t.content; showTplPick.value = false; }

async function onSelectBlocksMode(): Promise<void> {
  form.contentMode = 'blocks';
  if (contentBlocks.value.length === 0) {
    try { const res = await api.get('/content-blocks'); contentBlocks.value = res.data.blocks ?? []; } catch { /* empty */ }
  }
}
function toggleBlock(id: string): void { const i = form.contentBlockIds.indexOf(id); if (i >= 0) form.contentBlockIds.splice(i, 1); else form.contentBlockIds.push(id); }
function toggleDow(d: number): void { const i = form.daysOfWeek.indexOf(d); if (i >= 0) form.daysOfWeek.splice(i, 1); else form.daysOfWeek.push(d); }

function nextStep(): void {
  if (!stepValid.value) return;
  if (wizard.step === 3) { void countAudience(); } // vào bước 4 → tính lại (snapshot preview)
  wizard.step = Math.min(4, wizard.step + 1);
}
function prevStep(): void { wizard.step = Math.max(1, wizard.step - 1); }

async function openWizard(prefillList?: string): Promise<void> {
  wizard.open = true; wizard.step = 1; wizard.confirm = false;
  Object.assign(form, { name: '', sourceType: prefillList ? 'customer_list' : 'friends', customerListId: prefillList ?? '', zaloAccountId: '', messageText: '', contentMode: 'text', contentBlockIds: [], scheduledAtLocal: '', timeOfDay: '08:00', daysOfWeek: [], maxPerRun: 50, delaySecMin: 30, delaySecMax: 90 });
  audience.value = null; audienceError.value = ''; friendCount.value = null;
  if (lists.value.length === 0 || nicks.value.length === 0) {
    const [lr, nr] = await Promise.all([api.get('/customer-lists', { params: { status: 'active', limit: 100 } }), api.get('/zalo-accounts')]);
    lists.value = (lr.data.lists ?? lr.data ?? []).map((l: any) => ({ id: l.id, name: l.name, hasZaloEntries: l.hasZaloEntries ?? 0 }));
    nicks.value = (nr.data.accounts ?? nr.data ?? []).map((n: any) => ({ id: n.id, displayName: n.displayName, phone: n.phone, status: n.status }));
  }
  try { const tr = await api.get('/automation/templates'); templates.value = (tr.data.templates ?? []).map((t: any) => ({ id: t.id, name: t.name, shortcut: t.shortcut, content: t.content })); } catch { templates.value = []; }
}
function closeWizard(): void { wizard.open = false; }

let creatingGuard = false;
async function createJob(): Promise<void> {
  if (creatingGuard) return; // chống double-submit
  if (!wizard.confirm || !audience.value) return;
  creatingGuard = true; creating.value = true;
  try {
    // Dry-run → payload.status='paused' (nháp, cron bỏ qua, KHÔNG gửi thật).
    await api.post('/broadcast-jobs', buildBroadcastPayload(form, dryRun));
    toast(dryRun ? 'Đã tạo broadcast NHÁP (dry-run — chưa gửi)' : 'Đã tạo broadcast', 'success');
    wizard.open = false;
    await load();
  } catch (err: any) {
    toast(`Lỗi: ${err?.response?.data?.error ?? 'không tạo được'}`, 'error');
  } finally { creating.value = false; creatingGuard = false; }
}

async function load(): Promise<void> {
  try { const res = await api.get('/broadcast-jobs'); jobs.value = res.data.jobs; } finally { loading.value = false; }
}
function openDetail(job: JobRow): void { detail.jobId = job.id; detail.open = true; }

async function setStatus(job: JobRow, status: 'active' | 'paused'): Promise<void> { await api.patch(`/broadcast-jobs/${job.id}`, { status }); await load(); }
async function runNow(job: JobRow): Promise<void> {
  if (dryRun) return void toast('Dry-run đang bật — không gửi thật. Tắt VITE_MARKETING_DRY_RUN để chạy thật.', 'error');
  if (!(await confirm({ title: 'Chạy ngay?', message: `Gửi broadcast "${job.name}" ngay (worker bắt đầu ~30s).`, confirmText: 'Chạy ngay' }))) return;
  await api.post(`/broadcast-jobs/${job.id}/run-now`);
  toast('Đã xếp lịch chạy ngay', 'success'); await load();
}
async function removeJob(job: JobRow): Promise<void> {
  if (!(await confirm({ title: 'Xoá broadcast?', message: `Xoá "${job.name}" cùng log gửi. Không hoàn tác.`, confirmText: 'Xoá', tone: 'danger' }))) return;
  await api.delete(`/broadcast-jobs/${job.id}`); toast('Đã xoá', 'success'); await load();
}

function statusLabel(s: string): string { return s === 'active' ? 'Đang hoạt động' : s === 'paused' ? (dryRun ? 'Nháp (tạm dừng)' : 'Tạm dừng') : 'Đã xong'; }
function scheduleLabel(job: JobRow): string {
  if (job.scheduleType === 'once') return `1 lần — ${fmtDate(job.scheduledAt)}`;
  if (job.scheduleType === 'daily') return `Hàng ngày ${job.timeOfDay}`;
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `Hàng tuần ${job.daysOfWeek.map((d) => names[d]).join(', ')} lúc ${job.timeOfDay}`;
}
function scheduleLabelForm(): string {
  if (form.scheduleType === 'once') return `1 lần — ${form.scheduledAtLocal || '(chưa chọn)'}`;
  if (form.scheduleType === 'daily') return `Hàng ngày ${form.timeOfDay}`;
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `Hàng tuần ${form.daysOfWeek.map((d) => names[d]).join(', ')} lúc ${form.timeOfDay}`;
}
function fmtDate(d: string | null): string { return d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }

function firstQueryString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}
let appliedCreateFromList = '';
async function applyCreateFromListQuery(): Promise<void> {
  const fromList = firstQueryString(route.query.createFromList);
  if (!fromList || fromList === appliedCreateFromList) return;
  appliedCreateFromList = fromList;
  await openWizard(fromList);
}

onMounted(async () => {
  await load();
  pollTimer = setInterval(load, 15_000);
  await applyCreateFromListQuery();
});
watch(() => firstQueryString(route.query.createFromList), () => { void applyCreateFromListQuery(); });
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });

// Expose cho test
defineExpose({ wizard, form, stepValid, nextStep, prevStep, audience, unknownVars });
</script>

<style scoped>
.bc-view { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.mkt-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 20px 12px; border-bottom: 1px solid var(--border, #e5e4e7); }
.mtt { font-size: 18px; font-weight: 700; }
.mts { font-size: 13px; color: var(--text-secondary, #666); margin-top: 2px; max-width: 720px; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.bc-dry { margin: 10px 20px 0; font-size: 12.5px; background: #eef6ff; border: 1px solid #cfe3fb; color: #134a8a; border-radius: 8px; padding: 8px 12px; display: flex; gap: 8px; align-items: center; }
.bc-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.bc-empty { text-align: center; color: var(--text-secondary, #888); padding: 32px 0; }
.bc-card { display: flex; justify-content: space-between; gap: 12px; border: 1px solid var(--border, #e5e4e7); border-radius: 10px; padding: 12px 14px; background: var(--surface, #fff); }
.bc-card.st-paused { opacity: 0.8; }
.bc-card-main { flex: 1; min-width: 0; cursor: pointer; }
.bc-card-head { display: flex; align-items: center; gap: 8px; }
.bc-name { font-weight: 700; }
.bc-badge { font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
.b-active { background: #e1f5e9; color: #1b7a3d; }
.b-paused { background: #fdf3d7; color: #8a6d00; }
.b-done { background: #ececf0; color: #555; }
.bc-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--text-secondary, #666); margin-top: 4px; }
.bc-msg { font-size: 13px; margin-top: 6px; color: var(--text, #333); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 640px; }
.bc-run { margin-top: 6px; font-size: 12.5px; color: var(--text-secondary, #555); }
.run-badge { font-size: 11px; padding: 1px 7px; border-radius: 99px; font-weight: 600; margin-right: 6px; }
.r-running { background: #dcedff; color: #135ba1; }
.r-done, .r-sent { background: #e1f5e9; color: #1b7a3d; }
.r-error, .r-failed { background: #fde3e1; color: #a12318; }
.r-skipped { background: #ececf0; color: #555; }
.bc-card-actions { display: flex; gap: 4px; align-items: flex-start; flex-shrink: 0; }
.danger { color: #a12318; }
.bc-overlay { position: fixed; inset: 0; background: rgba(20, 20, 30, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bc-modal { background: var(--surface, #fff); border-radius: 12px; padding: 18px 20px; width: 560px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); overflow: auto; }
.bc-modal-wide { width: 720px; }
.bc-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 15px; }
.btn-x { background: none; border: none; cursor: pointer; padding: 2px; }
.bc-modal-foot { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.wz-steps { display: flex; gap: 6px; margin-bottom: 10px; }
.wz-step { flex: 1; font-size: 12px; color: #999; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 2px solid #e5e4e7; }
.wz-step.on { color: #0e445a; border-color: #0e445a; font-weight: 700; }
.wz-step.done { color: #1b7a3d; border-color: #9bd4b0; }
.wz-num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #e5e4e7; color: #666; font-size: 11px; font-weight: 700; }
.wz-step.on .wz-num { background: #0e445a; color: #fff; }
.wz-step.done .wz-num { background: #1b7a3d; color: #fff; }
.wz-body { min-height: 200px; }
.wz-audience { margin-top: 8px; border: 1px solid #d3e8dd; border-radius: 8px; padding: 6px 10px; font-size: 12.5px; background: #f6fbf8; }
.wz-a-row { display: flex; justify-content: space-between; padding: 2px 0; }
.wz-a-row.skip { color: #8a6d00; }
.wz-a-row b.ok { color: #1b7a3d; }
.wz-a-sub { font-size: 11.5px; color: #8a6d00; padding: 2px 0; }
.wz-review { display: flex; gap: 12px; }
.wz-rev-col { flex: 1; border: 1px solid var(--border, #e5e4e7); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; }
.wz-rev-h { font-weight: 700; margin-bottom: 4px; }
.wz-confirm { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; font-weight: 600; }
.f-label { display: block; font-size: 12.5px; font-weight: 600; margin: 10px 0 4px; }
.f-hint { font-weight: 400; color: var(--text-secondary, #888); font-size: 12px; }
.f-note { font-size: 12.5px; line-height: 1.5; color: var(--text-secondary, #555); background: #f0f7f3; border: 1px solid #d3e8dd; border-radius: 8px; padding: 8px 10px; }
.f-note.warn { background: #fdf6e3; border-color: #f0e2b8; color: #7a5c00; }
.f-input { width: 100%; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 7px 10px; font-size: 13.5px; background: var(--surface, #fff); color: inherit; }
.f-area { resize: vertical; }
.f-row { display: flex; gap: 10px; }
.f-col { flex: 1; min-width: 0; }
.f-grow { flex: 2; }
.f-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.f-tab { border: 1px solid var(--border, #d5d4d8); background: none; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.f-tab.on { background: #0e445a; color: #fff; border-color: #0e445a; }
.f-vars { display: flex; gap: 4px; flex-wrap: wrap; margin: 6px 0; }
.f-var { border: 1px solid #cfe3fb; background: #eef6ff; color: #134a8a; border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer; font-family: monospace; }
.f-var.alt { background: #f2eefb; border-color: #ddd0f5; color: #5a3a9a; font-family: inherit; }
.f-tpl-pick { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.f-tpl { border: 1px solid var(--border, #d5d4d8); background: none; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; }
.f-preview { font-size: 12.5px; margin-top: 8px; background: #f6f6f8; border-radius: 8px; padding: 8px 10px; color: var(--text, #333); }
.f-preview-lbl { color: var(--text-secondary, #888); font-weight: 600; }
.f-dows { display: flex; gap: 4px; flex-wrap: wrap; }
.f-dow { border: 1px solid var(--border, #d5d4d8); background: none; border-radius: 6px; padding: 5px 9px; font-size: 12.5px; cursor: pointer; }
.f-dow.on { background: #0e445a; color: #fff; border-color: #0e445a; }
.f-block-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow: auto; }
.f-block-item { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
.f-block-info { min-width: 0; flex: 1; }
.f-block-name { font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.f-block-order { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #0e445a; color: #fff; font-size: 11px; font-weight: 700; }
.f-block-text { font-size: 12px; color: var(--text-secondary, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
