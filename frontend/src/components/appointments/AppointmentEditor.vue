<!--
  AppointmentEditor.vue — 1 modal duy nhất cho create + edit "Nhắc hẹn".

  Replace AppointmentQuickCreate.vue cũ (sẽ delete sau khi shipping).
  Memory reference: reference_zalocrm_nhac_hen_terminology.md
  Design mockup:    ~/.gstack/projects/zalocrm/designs/nhac-hen-editor-20260521/

  9 sections theo mockup:
    1. Header
    2. Tiêu đề (font 500, default = tên KH)
    3. KH autocomplete (nếu không có context KH)
    4. Ngày + Giờ (2 cols, custom pickers)
    5. Quick time chips (Sáng/Trưa/Chiều/Tối — random + re-roll)
    6. Duration grid (5p → 3 ngày, default 15p, compute endAt)
    7. Loại (4 icon chips: Gọi điện/Nhắn tin/Gặp mặt/Theo dõi)
    8. Địa điểm (input + 5 preset chips + smart suggest từ tiêu đề)
    9. Ghi chú (textarea optional)
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="editor-backdrop" @click.self="close">
      <div class="editor airtable-scope" @keydown.escape="close" @keydown.ctrl.enter="submit" tabindex="-1" ref="editorRef">
        <!-- ─── Header ─── -->
        <div class="editor-head">
          <h2>📌 {{ isEdit ? 'Sửa nhắc hẹn' : 'Tạo nhắc hẹn' }}</h2>
          <button class="close" @click="close" title="Đóng (Esc)">✕</button>
        </div>

        <!-- ─── Body ─── -->
        <div class="editor-body">
          <!-- 1. Tiêu đề -->
          <div class="field">
            <span class="field-label">Tiêu đề</span>
            <input
              ref="titleInputRef"
              v-model="form.title"
              class="title-input"
              type="text"
              :placeholder="titlePlaceholder"
            />
            <!-- Linked KH chip nếu đã có -->
            <div v-if="selectedContact" class="linked-kh-chip">
              <span class="av" :style="{ background: contactColor(selectedContact.id) }">
                {{ initials(selectedContact.fullName) }}
              </span>
              {{ selectedContact.fullName || 'Khách hàng' }}
              <span v-if="selectedContact.phone">· {{ selectedContact.phone }}</span>
              <button class="remove" @click="clearContact" title="Bỏ link KH">✕</button>
            </div>
            <!-- KH autocomplete dropdown (chỉ hiện khi chưa có KH + đang focus) -->
            <div v-else-if="custSuggestOpen" class="cust-suggest">
              <div class="cust-suggest-head">
                🔍 Liên kết khách hàng <span class="opt">(tuỳ chọn)</span>
              </div>
              <input
                v-model="custQuery"
                class="cust-suggest-search"
                type="text"
                placeholder="Tìm tên / SĐT / Zalo UID..."
                autocomplete="off"
                @input="onCustSearch"
              />
              <div v-if="custSearching" class="cust-loading">Đang tìm...</div>
              <div
                v-for="c in custSuggestions"
                :key="c.id"
                class="cust-item"
                @mousedown.prevent="pickContact(c)"
              >
                <span class="av" :style="{ background: contactColor(c.id) }">{{ initials(c.fullName) }}</span>
                <div>
                  <div class="name">{{ c.fullName || 'Khách hàng' }}</div>
                  <div class="meta">
                    <span v-if="c.phone">{{ c.phone }}</span>
                    <span v-if="c.zaloUid"> · {{ c.zaloUid }}</span>
                  </div>
                </div>
              </div>
              <div v-if="!custSearching && custQuery && custSuggestions.length === 0" class="cust-empty">
                Không tìm thấy KH "{{ custQuery }}"
              </div>
              <div class="cust-item skip" @mousedown.prevent="dismissCustSuggest">
                → Bỏ qua, tạo nhắc hẹn không link KH
              </div>
            </div>
            <button v-else type="button" class="link-kh-btn" @click="openCustSuggest">
              + Liên kết khách hàng
            </button>
          </div>

          <!-- 2. Ngày + Giờ (2 cols) -->
          <div class="row-2">
            <div class="field">
              <span class="field-label">Ngày</span>
              <button class="picker-display" @click="openDatePicker = !openDatePicker">
                <span class="ic">📅</span>
                <span class="val">{{ dateLabel }}</span>
                <span class="caret">{{ openDatePicker ? '▴' : '▾' }}</span>
              </button>
              <!-- Date picker dropdown -->
              <div v-if="openDatePicker" class="picker-popup date-popup">
                <div class="dp-head">
                  <button @click="shiftCalMonth(-1)">‹</button>
                  <span class="month">Tháng {{ calMonth.getMonth() + 1 }}, {{ calMonth.getFullYear() }}</span>
                  <button @click="shiftCalMonth(1)">›</button>
                </div>
                <div class="dp-grid">
                  <div v-for="w in ['CN','T2','T3','T4','T5','T6','T7']" :key="w" class="dp-wd">{{ w }}</div>
                  <div
                    v-for="cell in calCells"
                    :key="cell.iso"
                    class="dp-day"
                    :class="{ muted: cell.muted, today: cell.isToday, selected: cell.iso === form.date }"
                    @click="pickDate(cell.date)"
                  >{{ cell.day }}</div>
                </div>
                <div class="dp-tip-divider"></div>
                <div class="dp-tips">
                  <button
                    v-for="t in dateTips"
                    :key="t.label"
                    type="button"
                    class="tip-chip"
                    @click="pickDateOffset(t.offset)"
                  >{{ t.label }}</button>
                </div>
              </div>
            </div>
            <div class="field">
              <span class="field-label">Giờ bắt đầu</span>
              <button class="picker-display" @click="openTimePicker = !openTimePicker">
                <span class="ic">🕐</span>
                <span class="val">{{ form.time || '--:--' }}</span>
                <span class="caret">{{ openTimePicker ? '▴' : '▾' }}</span>
              </button>
              <!-- Time picker dropdown (iOS wheel style) -->
              <div v-if="openTimePicker" class="picker-popup time-popup">
                <div class="tp-wheels">
                  <div class="tp-fade tp-fade--top"></div>
                  <div class="tp-fade tp-fade--bot"></div>
                  <!-- Hour wheel -->
                  <div class="tp-wheel" @wheel.prevent="onHourWheel">
                    <div class="tp-wheel-items" :style="{ transform: `translateY(${-hourWheelOffset}px)` }">
                      <div
                        v-for="h in HOURS"
                        :key="h"
                        class="tp-wheel-item"
                        :class="{ selected: h === hourValue }"
                        @click="setHour(h)"
                      >{{ String(h).padStart(2, '0') }}</div>
                    </div>
                  </div>
                  <div class="tp-separator">:</div>
                  <!-- Minute wheel -->
                  <div class="tp-wheel" @wheel.prevent="onMinuteWheel">
                    <div class="tp-wheel-items" :style="{ transform: `translateY(${-minuteWheelOffset}px)` }">
                      <div
                        v-for="m in MINUTES"
                        :key="m"
                        class="tp-wheel-item"
                        :class="{ selected: m === minuteValue }"
                        @click="setMinute(m)"
                      >{{ String(m).padStart(2, '0') }}</div>
                    </div>
                  </div>
                </div>
                <div class="tp-quick">
                  <button type="button" class="tip-chip" @click="randomTime('morning')">☀️ Sáng</button>
                  <button type="button" class="tip-chip" @click="randomTime('noon')">🌤 Trưa</button>
                  <button type="button" class="tip-chip" @click="randomTime('afternoon')">⛅ Chiều</button>
                  <button type="button" class="tip-chip" @click="randomTime('evening')">🌙 Tối</button>
                </div>
                <div class="tp-helper">Bấm lại 1 chip để random giờ khác trong khung</div>
              </div>
            </div>
          </div>

          <!-- 3. Duration -->
          <div class="field">
            <span class="field-label">Dự kiến dành thời gian</span>
            <div class="duration-grid">
              <button
                v-for="d in DURATIONS"
                :key="d.value"
                type="button"
                class="tip-chip"
                :class="{ active: form.durationMin === d.value }"
                @click="form.durationMin = d.value"
              >{{ d.label }}</button>
            </div>
            <div class="compute-end">
              <span class="ic">🏁</span>
              <span>Cuộc hẹn kết thúc lúc <b>{{ computedEndLabel }}</b> (tự tính)</span>
            </div>
          </div>

          <!-- 4. Loại (4 icon chips) -->
          <div class="field">
            <span class="field-label">Loại nhắc hẹn</span>
            <div class="type-row">
              <button
                v-for="t in APPOINTMENT_TYPE_OPTIONS"
                :key="t.value"
                type="button"
                class="type-chip"
                :class="{ active: form.type === t.value }"
                :data-t="t.value"
                @click="form.type = t.value"
              >
                <span class="type-ico">{{ typeIcon(t.value) }}</span>
                {{ t.text }}
              </button>
            </div>
          </div>

          <!-- 5. Địa điểm -->
          <div class="field">
            <span class="field-label">Địa điểm</span>
            <input
              v-model="form.location"
              class="location-input"
              type="text"
              placeholder="Nhập địa điểm hoặc chọn nhanh bên dưới..."
            />
            <div class="tip-row">
              <button
                v-for="p in LOCATION_PRESETS"
                :key="p.value"
                type="button"
                class="tip-chip"
                @click="form.location = p.value"
              >{{ p.icon }} {{ p.value }}</button>
              <button
                v-if="smartLocation"
                type="button"
                class="tip-chip smart"
                @click="form.location = smartLocation"
                :title="'Gợi ý từ tiêu đề'"
              >🤖 {{ smartLocation }}</button>
            </div>
          </div>

          <!-- 6. Ghi chú -->
          <div class="field">
            <span class="field-label">Ghi chú</span>
            <textarea
              v-model="form.notes"
              class="notes-area"
              placeholder="Sale ghi note nội bộ về cuộc hẹn..."
              rows="2"
            ></textarea>
          </div>

          <!-- Error -->
          <div v-if="error" class="error-banner">⚠️ {{ error }}</div>
        </div>

        <!-- ─── Footer ─── -->
        <div class="editor-foot">
          <span class="tip">💡 <kbd>Ctrl</kbd>+<kbd>Enter</kbd> tạo nhanh · <kbd>Esc</kbd> huỷ</span>
          <div class="actions">
            <button type="button" class="at-btn at-btn--secondary" @click="close">Huỷ</button>
            <button
              type="button"
              class="at-btn at-btn--primary"
              :disabled="!canSubmit || saving"
              @click="submit"
            >
              {{ saving ? 'Đang lưu...' : (isEdit ? '✓ Cập nhật' : '✓ Tạo nhắc hẹn') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { api } from '@/api/index';
import {
  APPOINTMENT_TYPE_OPTIONS,
  typeIcon,
  initials,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';

interface ContactLite {
  id: string;
  fullName: string | null;
  phone: string | null;
  zaloUid?: string | null;
  avatarUrl?: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  /** Mở ở mode edit khi truyền appointment, ngược lại = create */
  appointment?: Appointment | null;
  /** Default date khi tạo mới (vd click slot week-view) */
  defaultDate?: Date | null;
  /** Prefill contact (vd mở từ contact page) */
  prefillContact?: ContactLite | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created', a: Appointment): void;
  (e: 'updated', a: Appointment): void;
}>();

const editorRef = ref<HTMLDivElement | null>(null);
const titleInputRef = ref<HTMLInputElement | null>(null);

const isEdit = computed(() => !!props.appointment);

// ───────── Contact state ─────────
const selectedContact = ref<ContactLite | null>(null);
const custSuggestOpen = ref(false);
const custQuery = ref('');
const custSuggestions = ref<ContactLite[]>([]);
const custSearching = ref(false);

function openCustSuggest() {
  custSuggestOpen.value = true;
  nextTick(() => {
    const el = editorRef.value?.querySelector<HTMLInputElement>('.cust-suggest-search');
    el?.focus();
  });
}

function dismissCustSuggest() {
  custSuggestOpen.value = false;
  custQuery.value = '';
  custSuggestions.value = [];
}

let custSearchHandle: number | null = null;
function onCustSearch() {
  if (custSearchHandle) window.clearTimeout(custSearchHandle);
  const q = custQuery.value.trim();
  if (!q) { custSuggestions.value = []; return; }
  custSearching.value = true;
  custSearchHandle = window.setTimeout(async () => {
    try {
      const res = await api.get('/contacts', { params: { search: q, limit: 8 } });
      custSuggestions.value = (res.data.contacts ?? res.data ?? []).slice(0, 8);
    } catch (err) {
      console.error('[editor] contact search failed', err);
      custSuggestions.value = [];
    } finally {
      custSearching.value = false;
    }
  }, 220);
}

function pickContact(c: ContactLite) {
  selectedContact.value = c;
  custSuggestOpen.value = false;
  custQuery.value = '';
  // Auto-fill title nếu chưa có
  if (!form.title.trim() && c.fullName) {
    form.title = `Gọi nhắc KH ${c.fullName}`;
  }
}

function clearContact() {
  selectedContact.value = null;
}

// ───────── Form state ─────────
const form = reactive({
  title: '',
  date: '',
  time: '',
  durationMin: 15,
  type: 'call',
  location: '',
  notes: '',
});

const saving = ref(false);
const error = ref('');

const titlePlaceholder = computed(() =>
  selectedContact.value?.fullName
    ? `Gọi nhắc KH ${selectedContact.value.fullName}`
    : 'Gọi nhắc khách hàng...',
);

const canSubmit = computed(() =>
  !!form.title.trim() && !!form.date && !!form.time && !!form.type,
);

// ───────── Init / reset state khi mở ─────────
watch(() => props.modelValue, (open) => {
  if (!open) return;
  error.value = '';
  saving.value = false;
  openDatePicker.value = false;
  openTimePicker.value = false;
  custSuggestOpen.value = false;
  custQuery.value = '';

  if (props.appointment) {
    // Edit mode
    const a = props.appointment;
    form.title = (a as any).title || (a.contact?.fullName ? `Nhắc hẹn KH ${a.contact.fullName}` : '');
    form.date = a.appointmentDate;
    form.time = a.appointmentTime;
    form.durationMin = (a as any).durationMin || 15;
    form.type = a.type || 'call';
    form.location = (a as any).location || '';
    form.notes = a.notes || '';
    selectedContact.value = a.contact ? {
      id: a.contact.id,
      fullName: a.contact.fullName,
      phone: a.contact.phone,
      zaloUid: a.contact.zaloUid ?? null,
    } : null;
    calMonth.value = a.appointmentDate ? new Date(a.appointmentDate) : new Date();
  } else {
    // Create mode
    const base = props.defaultDate || roundToNextSlot(new Date());
    form.date = isoDate(base);
    form.time = isoTime(base);
    form.durationMin = 15;
    form.type = 'call';
    form.location = '';
    form.notes = '';
    selectedContact.value = props.prefillContact ?? null;
    if (props.prefillContact?.fullName) {
      form.title = `Gọi nhắc KH ${props.prefillContact.fullName}`;
    } else {
      form.title = '';
    }
    calMonth.value = new Date(base);
  }

  nextTick(() => titleInputRef.value?.focus());
});

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function roundToNextSlot(d: Date): Date {
  // Round lên slot phút gần nhất trong [0, 10, 15, 30, 45, 50]
  const out = new Date(d);
  out.setSeconds(0, 0);
  const slots = [0, 10, 15, 30, 45, 50];
  const m = out.getMinutes();
  const next = slots.find((s) => s > m);
  if (next != null) {
    out.setMinutes(next);
  } else {
    out.setHours(out.getHours() + 1);
    out.setMinutes(0);
  }
  return out;
}

// ───────── Date label ─────────
const VN_DOWS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dateLabel = computed(() => {
  if (!form.date) return 'Chọn ngày...';
  const d = new Date(form.date);
  return `${VN_DOWS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
});

// ───────── Date picker ─────────
const openDatePicker = ref(false);
const calMonth = ref(new Date());

function shiftCalMonth(delta: number) {
  const d = new Date(calMonth.value);
  d.setMonth(d.getMonth() + delta);
  calMonth.value = d;
}

interface CalCell { date: Date; iso: string; day: number; muted: boolean; isToday: boolean }
const calCells = computed<CalCell[]>(() => {
  const year = calMonth.value.getFullYear();
  const month = calMonth.value.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  // VN week starts Sunday (CN=0)? Anh dùng CN-T2-...-T7. JS getDay=0 (CN).
  const offset = firstOfMonth.getDay();
  const start = new Date(year, month, 1 - offset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cells: CalCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      iso: isoDate(d),
      day: d.getDate(),
      muted: d.getMonth() !== month,
      isToday: d.getTime() === today.getTime(),
    });
  }
  return cells;
});

function pickDate(d: Date) {
  form.date = isoDate(d);
  openDatePicker.value = false;
}

function pickDateOffset(offsetDays: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  form.date = isoDate(d);
  calMonth.value = new Date(d);
  openDatePicker.value = false;
}

const dateTips = [
  { label: 'Hôm nay',    offset: 0 },
  { label: 'Ngày mai',   offset: 1 },
  { label: 'Ngày mốt',   offset: 2 },
  { label: '+3 ngày',    offset: 3 },
  { label: '+5 ngày',    offset: 5 },
  { label: '+7 ngày',    offset: 7 },
  { label: '+10 ngày',   offset: 10 },
  { label: '+15 ngày',   offset: 15 },
  { label: '+1 tháng',   offset: 30 },
];

// ───────── Time picker (iOS wheel) ─────────
const openTimePicker = ref(false);
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23
const MINUTES = [0, 10, 15, 30, 45, 50];
const WHEEL_ITEM_H = 40;

const hourValue = computed<number>(() => {
  if (!form.time) return 9;
  return parseInt(form.time.split(':')[0], 10);
});
const minuteValue = computed<number>(() => {
  if (!form.time) return 30;
  return parseInt(form.time.split(':')[1], 10);
});

// Wheel translation: center selected → translateY = (idx * H) - (centerOffset)
const hourWheelOffset = computed(() => {
  const idx = HOURS.indexOf(hourValue.value);
  return idx >= 0 ? idx * WHEEL_ITEM_H - 2 * WHEEL_ITEM_H : 0;
});
const minuteWheelOffset = computed(() => {
  const idx = MINUTES.indexOf(minuteValue.value);
  return idx >= 0 ? idx * WHEEL_ITEM_H - 2 * WHEEL_ITEM_H : 0;
});

function setHour(h: number) {
  const m = minuteValue.value;
  form.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function setMinute(m: number) {
  const h = hourValue.value;
  form.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function onHourWheel(e: WheelEvent) {
  const dir = e.deltaY > 0 ? 1 : -1;
  const idx = HOURS.indexOf(hourValue.value);
  const next = Math.max(0, Math.min(HOURS.length - 1, idx + dir));
  setHour(HOURS[next]);
}
function onMinuteWheel(e: WheelEvent) {
  const dir = e.deltaY > 0 ? 1 : -1;
  const idx = MINUTES.indexOf(minuteValue.value);
  const next = Math.max(0, Math.min(MINUTES.length - 1, idx + dir));
  setMinute(MINUTES[next]);
}

// Random time trong khung Sáng/Trưa/Chiều/Tối — re-roll khi click lại
const TIME_RANGES: Record<string, [number, number]> = {
  morning:   [6, 11],
  noon:      [12, 12],
  afternoon: [13, 15],
  evening:   [16, 23],
};
function randomTime(period: 'morning' | 'noon' | 'afternoon' | 'evening') {
  const [lo, hi] = TIME_RANGES[period];
  const h = lo + Math.floor(Math.random() * (hi - lo + 1));
  const m = MINUTES[Math.floor(Math.random() * MINUTES.length)];
  form.time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ───────── Duration ─────────
const DURATIONS = [
  { label: '5p',     value: 5 },
  { label: '10p',    value: 10 },
  { label: '15p',    value: 15 },
  { label: '30p',    value: 30 },
  { label: '1 giờ',  value: 60 },
  { label: '2 giờ',  value: 120 },
  { label: '5 giờ',  value: 300 },
  { label: '8 giờ',  value: 480 },
  { label: '12 giờ', value: 720 },
  { label: '1 ngày', value: 1440 },
  { label: '3 ngày', value: 4320 },
];

const computedEndLabel = computed(() => {
  if (!form.time || !form.durationMin) return '--:--';
  const [h, m] = form.time.split(':').map((s) => parseInt(s, 10));
  const startMin = h * 60 + m;
  const endMin = startMin + form.durationMin;
  const endH = Math.floor(endMin / 60) % 24;
  const endM = endMin % 60;
  const dayOffset = Math.floor(endMin / (24 * 60));
  const base = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  if (dayOffset > 0) return `${base} (+${dayOffset} ngày)`;
  return base;
});

// ───────── Smart location detection (regex từ title) ─────────
const SMART_LOCATION_REGEX = [
  // Tên dự án BĐS phổ biến
  /(Vinhomes [A-Za-zÀ-ỹ ]+)/i,
  /(Masteri [A-Za-zÀ-ỹ ]+)/i,
  /(Sunshine [A-Za-zÀ-ỹ ]+)/i,
  /(Eco [A-Za-zÀ-ỹ ]+(?:City|Park|Smart))/i,
  /(Saigon [A-Za-zÀ-ỹ ]+)/i,
  /(The [A-Za-zÀ-ỹ ]+(?:Origin|Heights|Manor|Garden))/i,
  /(Glory [A-Za-zÀ-ỹ ]+)/i,
  // Generic địa danh sau "tại" / "ở"
  /(?:tại|ở)\s+([A-ZÀ-Ỹ][A-Za-zÀ-ỹ0-9 ,]{3,40}?)(?:\s+(?:vào|lúc|cho|với|—|-)|$)/u,
];

const smartLocation = computed<string | null>(() => {
  const title = form.title.trim();
  if (!title) return null;
  for (const r of SMART_LOCATION_REGEX) {
    const m = title.match(r);
    if (m && m[1]) {
      const v = m[1].trim();
      // Bỏ qua nếu trùng với input location hiện tại
      if (v.toLowerCase() === form.location.toLowerCase()) return null;
      return v;
    }
  }
  return null;
});

const LOCATION_PRESETS = [
  { icon: '🏢', value: 'Văn phòng' },
  { icon: '🏠', value: 'Nhà khách' },
  { icon: '🏗', value: 'Dự án' },
  { icon: '🏘', value: 'Nhà mẫu' },
  { icon: '☕', value: 'Quán cafe' },
];

// ───────── Contact color (consistent hash) ─────────
const PALETTE = ['#aa2d00', '#0a2e0e', '#d9a441', '#fcab79', '#a8d8c4', '#1b61c9'];
function contactColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ───────── Submit / close ─────────
async function submit() {
  if (!canSubmit.value) {
    error.value = 'Điền tiêu đề, ngày và giờ trước khi tạo nhắc hẹn';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      title: form.title.trim(),
      contactId: selectedContact.value?.id ?? null,
      appointmentDate: form.date,
      appointmentTime: form.time,
      durationMin: form.durationMin,
      type: form.type,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (isEdit.value && props.appointment) {
      const res = await api.patch(`/appointments/${props.appointment.id}`, payload);
      emit('updated', res.data);
    } else {
      const res = await api.post('/appointments', payload);
      emit('created', res.data);
    }
    close();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Không lưu được nhắc hẹn';
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('update:modelValue', false);
}
</script>

<style scoped>
@import '@/components/automation/phase7/airtable.css';

/* ─── Backdrop + modal ─── */
.editor-backdrop {
  position: fixed; inset: 0;
  background: rgba(24, 29, 38, 0.55);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: var(--at-s-md);
}
.editor {
  width: 560px; max-width: 100%;
  max-height: 92vh;
  background: var(--at-canvas);
  border-radius: var(--at-r-lg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column;
  overflow: hidden;
  outline: none;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--at-body);
}

.editor-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--at-s-md) var(--at-s-lg);
  border-bottom: 1px solid var(--at-hairline);
}
.editor-head h2 { font-size: 18px; font-weight: 500; color: var(--at-ink); margin: 0; }
.editor-head .close {
  width: 32px; height: 32px; border-radius: var(--at-r-md);
  background: transparent; border: none; color: var(--at-muted);
  font-size: 18px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.editor-head .close:active { background: var(--at-surface-soft); }

.editor-body {
  flex: 1; overflow-y: auto;
  padding: var(--at-s-md) var(--at-s-lg);
  display: flex; flex-direction: column; gap: var(--at-s-md);
}

.editor-foot {
  display: flex; align-items: center; justify-content: space-between; gap: var(--at-s-xs);
  padding: var(--at-s-sm) var(--at-s-lg);
  background: var(--at-surface-soft);
  border-top: 1px solid var(--at-hairline);
}
.editor-foot .tip {
  font-size: 11.5px; color: var(--at-muted);
  display: inline-flex; align-items: center; gap: 4px;
}
.editor-foot kbd {
  display: inline-block; padding: 1px 5px;
  background: var(--at-canvas); border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-xs);
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 10.5px; margin: 0 1px;
}
.editor-foot .actions { display: flex; gap: 6px; }

/* ─── Field common ─── */
.field { display: flex; flex-direction: column; gap: var(--at-s-xs); position: relative; }
.field-label {
  font-size: 11.5px; font-weight: 500; color: var(--at-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--at-s-sm); }

/* Title input (font-weight 500 size 16 — đậm hơn body) */
.title-input {
  width: 100%; height: 48px; padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  font-family: inherit; font-size: 16px; font-weight: 500;
  color: var(--at-ink); background: var(--at-canvas); outline: none;
}
.title-input:focus { border-color: var(--at-ink); }
.title-input::placeholder { font-weight: 400; color: var(--at-muted); }

/* Linked KH chip dưới title */
.linked-kh-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 4px 4px 10px;
  background: var(--at-coral-tint); color: var(--at-coral-text);
  border-radius: var(--at-r-pill);
  font-size: 12px; font-weight: 500;
  align-self: flex-start;
}
.linked-kh-chip .av {
  width: 22px; height: 22px; border-radius: 50%;
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 500;
}
.linked-kh-chip .remove {
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.08); border: none; cursor: pointer;
  font-size: 11px; color: inherit;
  display: inline-flex; align-items: center; justify-content: center;
}
.link-kh-btn {
  align-self: flex-start;
  font-size: 12px; color: var(--at-link); cursor: pointer;
  background: transparent; border: 1px dashed var(--at-hairline);
  border-radius: var(--at-r-sm); padding: 5px 10px;
  font-family: inherit;
}
.link-kh-btn:active { background: var(--at-surface-soft); }

/* KH autocomplete */
.cust-suggest {
  background: var(--at-canvas); border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-md); padding: var(--at-s-xs);
  max-height: 260px; overflow-y: auto;
}
.cust-suggest-head {
  font-size: 11.5px; color: var(--at-muted);
  padding: var(--at-s-xs); margin-bottom: 4px;
}
.cust-suggest-head .opt { color: var(--at-ink); font-weight: 500; margin-left: 4px; }
.cust-suggest-search {
  width: 100%; padding: 8px 12px;
  background: var(--at-surface-soft); border: 1px solid var(--at-hairline);
  border-radius: var(--at-r-sm); font-size: 13px; font-family: inherit;
  outline: none; margin-bottom: var(--at-s-xs);
}
.cust-suggest-search:focus { border-color: var(--at-ink); }
.cust-loading, .cust-empty {
  padding: 10px; font-size: 12.5px; color: var(--at-muted);
  text-align: center;
}
.cust-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--at-r-sm); cursor: pointer;
  font-size: 13px;
}
.cust-item:active { background: var(--at-surface-soft); }
.cust-item .av {
  width: 28px; height: 28px; border-radius: 50%;
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 500; flex-shrink: 0;
}
.cust-item .name { font-weight: 500; color: var(--at-ink); }
.cust-item .meta { font-size: 11.5px; color: var(--at-muted); }
.cust-item.skip {
  margin-top: 4px; padding-top: 8px;
  border-top: 1px solid var(--at-hairline);
  color: var(--at-muted); font-style: italic;
}

/* Picker display button */
.picker-display {
  width: 100%; height: 44px; padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  background: var(--at-canvas);
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 14px; color: var(--at-ink); cursor: pointer;
  font-family: inherit;
}
.picker-display:active { background: var(--at-surface-soft); }
.picker-display .ic { color: var(--at-muted); }
.picker-display .val { font-weight: 500; flex: 1; text-align: left; }
.picker-display .caret { color: var(--at-muted); font-size: 10px; }

/* Picker popups */
.picker-popup {
  position: absolute; top: calc(100% + 4px); left: 0;
  z-index: 10;
  background: var(--at-canvas);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-lg);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
  padding: var(--at-s-md);
  width: 320px;
}
.date-popup, .time-popup { width: 320px; }

/* Date picker grid */
.dp-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: var(--at-s-sm);
}
.dp-head .month { font-size: 14px; font-weight: 500; color: var(--at-ink); }
.dp-head button {
  width: 32px; height: 32px; border-radius: var(--at-r-md);
  background: transparent; border: none; cursor: pointer;
  color: var(--at-body); font-size: 14px;
  display: inline-flex; align-items: center; justify-content: center;
}
.dp-head button:active { background: var(--at-surface-soft); }
.dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dp-wd {
  font-size: 10.5px; color: var(--at-muted); text-align: center;
  padding: 6px 0; font-weight: 500;
}
.dp-day {
  aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--at-body); border-radius: var(--at-r-md);
  cursor: pointer;
}
.dp-day:active { background: var(--at-surface-soft); }
.dp-day.muted { color: var(--at-muted); opacity: 0.4; }
.dp-day.today { background: var(--at-ink); color: var(--at-on-primary); font-weight: 500; }
.dp-day.selected:not(.today) {
  background: var(--at-coral-tint); color: var(--at-coral-text); font-weight: 500;
}
.dp-tip-divider {
  height: 1px; background: var(--at-hairline);
  margin: var(--at-s-sm) calc(-1 * var(--at-s-md));
}
.dp-tips { display: flex; flex-wrap: wrap; gap: 5px; }
.dp-tips .tip-chip { font-size: 11.5px; padding: 5px 9px; }

/* Time picker wheels */
.tp-wheels {
  display: flex; align-items: center; justify-content: center; gap: var(--at-s-md);
  height: 200px; position: relative;
  background: var(--at-surface-soft);
  border-radius: var(--at-r-md);
  overflow: hidden;
}
.tp-wheels::before, .tp-wheels::after {
  content: ''; position: absolute; left: 8%; right: 8%;
  height: 1px; background: var(--at-border-strong);
  pointer-events: none; z-index: 2;
}
.tp-wheels::before { top: 80px; }
.tp-wheels::after { top: 120px; }
.tp-fade { position: absolute; left: 0; right: 0; pointer-events: none; z-index: 3; }
.tp-fade--top { top: 0; height: 80px; background: linear-gradient(to bottom, var(--at-surface-soft) 0%, rgba(248, 250, 252, 0) 100%); }
.tp-fade--bot { bottom: 0; height: 80px; background: linear-gradient(to top, var(--at-surface-soft) 0%, rgba(248, 250, 252, 0) 100%); }
.tp-wheel {
  width: 80px; height: 200px; overflow: hidden;
  display: flex; flex-direction: column;
  position: relative; z-index: 1;
}
.tp-wheel-items {
  display: flex; flex-direction: column; align-items: center;
  transition: transform 0.25s ease;
}
.tp-wheel-item {
  height: 40px; display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 400; color: var(--at-muted);
  font-variant-numeric: tabular-nums;
  width: 100%; cursor: pointer;
  flex-shrink: 0;
}
.tp-wheel-item.selected {
  color: var(--at-ink); font-weight: 500; font-size: 24px;
}
.tp-separator { font-size: 24px; font-weight: 500; color: var(--at-ink); z-index: 4; }
.tp-quick { margin-top: var(--at-s-md); display: flex; gap: 6px; }
.tp-quick .tip-chip { flex: 1; justify-content: center; }
.tp-helper {
  margin-top: 8px; text-align: center;
  font-size: 11px; color: var(--at-muted);
}

/* Chips */
.tip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.tip-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 11px; background: var(--at-canvas);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-pill);
  font-size: 12.5px; font-weight: 500; color: var(--at-body);
  cursor: pointer; font-family: inherit; white-space: nowrap;
}
.tip-chip:active { background: var(--at-surface-soft); }
.tip-chip.active {
  background: var(--at-ink); color: var(--at-on-primary); border-color: var(--at-ink);
}
.tip-chip.smart {
  background: var(--at-cream); border-color: var(--at-mustard); color: var(--at-ink);
}

/* Duration grid */
.duration-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
}
.duration-grid .tip-chip { justify-content: center; padding: 7px 8px; font-size: 12.5px; }

.compute-end {
  margin-top: 6px; padding: 8px 12px;
  background: var(--at-cream); border-radius: var(--at-r-sm);
  font-size: 12.5px; color: var(--at-ink);
  display: flex; align-items: center; gap: 6px;
}
.compute-end b { font-weight: 500; }
.compute-end .ic { font-size: 14px; }

/* Type chips */
.type-row { display: flex; gap: 6px; flex-wrap: wrap; }
.type-chip {
  flex: 1; min-width: 120px;
  padding: 10px 12px; border-radius: var(--at-r-md);
  border: 1px solid var(--at-hairline);
  display: flex; align-items: center; gap: 10px;
  background: var(--at-canvas); cursor: pointer;
  font-size: 13px; font-weight: 500; color: var(--at-body);
  font-family: inherit;
}
.type-chip:active { background: var(--at-surface-soft); }
.type-chip.active {
  border-color: var(--at-ink); background: var(--at-ink); color: var(--at-on-primary);
}
.type-chip .type-ico {
  width: 28px; height: 28px; border-radius: var(--at-r-sm);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.type-chip[data-t="call"]      .type-ico { background: #fdf0e3; color: #7a4115; }
.type-chip[data-t="message"]   .type-ico { background: #e8f4ee; color: #1f4d39; }
.type-chip[data-t="meeting"]   .type-ico { background: #fbe6dc; color: #7a2000; }
.type-chip[data-t="follow_up"] .type-ico { background: #fdf3df; color: #7a5818; }

/* Location input */
.location-input {
  width: 100%; height: 44px; padding: 0 var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  font-family: inherit; font-size: 14px; color: var(--at-ink);
  background: var(--at-canvas); outline: none;
}
.location-input:focus { border-color: var(--at-ink); }
.location-input::placeholder { color: var(--at-muted); }

/* Notes textarea */
.notes-area {
  width: 100%; min-height: 56px; max-height: 120px;
  padding: 10px var(--at-s-md);
  border: 1px solid var(--at-hairline); border-radius: var(--at-r-sm);
  font-family: inherit; font-size: 13.5px; color: var(--at-ink);
  background: var(--at-canvas); outline: none; resize: vertical;
}
.notes-area:focus { border-color: var(--at-ink); }
.notes-area::placeholder { color: var(--at-muted); font-style: italic; }

/* Buttons */
.at-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 18px; border-radius: var(--at-r-lg);
  font-size: 13.5px; font-weight: 500; cursor: pointer;
  font-family: inherit; white-space: nowrap; border: none;
}
.at-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.at-btn--primary { background: var(--at-ink); color: var(--at-on-primary); }
.at-btn--primary:active:not(:disabled) { background: var(--at-primary-active); }
.at-btn--secondary {
  background: var(--at-canvas); color: var(--at-ink);
  border: 1px solid var(--at-hairline);
}
.at-btn--secondary:active { background: var(--at-surface-soft); }

/* Error banner */
.error-banner {
  padding: 8px 12px;
  background: var(--at-coral-tint); color: var(--at-coral-text);
  border-radius: var(--at-r-sm);
  font-size: 12.5px;
}

/* ─── Mobile ─── */
@media (max-width: 600px) {
  .editor-backdrop { padding: 0; }
  .editor {
    width: 100%; max-width: 100%; max-height: 100vh;
    height: 100vh; border-radius: 0;
  }
  .editor-body { padding: var(--at-s-sm) var(--at-s-md); }
  .editor-foot { padding: var(--at-s-sm) var(--at-s-md); flex-direction: column-reverse; gap: var(--at-s-xs); }
  .editor-foot .tip { display: none; }
  .editor-foot .actions { width: 100%; }
  .editor-foot .actions .at-btn { flex: 1; }
  .row-2 { grid-template-columns: 1fr 1fr; gap: 8px; }
  .type-row { display: grid; grid-template-columns: repeat(2, 1fr); }
  .type-chip { min-width: 0; }
  .duration-grid { grid-template-columns: repeat(3, 1fr); }
  .picker-popup { width: 100%; }
}
</style>
