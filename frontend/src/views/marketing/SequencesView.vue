<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyen Tien Loc -->
<template>
  <div class="seq-view">
    <div class="mkt-top">
      <div>
        <div class="mtt">Luồng kịch bản</div>
        <div class="mts">
          Tạo các luồng bám đuổi thủ công để gắn cho khách trong tab Follow-up. Luồng đang bật sẽ hiện trong hộp thoại
          "Gắn luồng bám đuổi".
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="openCreate">
          <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo luồng
        </button>
      </div>
    </div>

    <div class="seq-body">
      <div v-if="loading" class="seq-empty">Đang tải...</div>
      <div v-else-if="sequences.length === 0" class="seq-empty">
        <v-icon size="42">mdi-target-variant</v-icon>
        <p>Chưa có luồng kịch bản nào. Bấm <b>Tạo luồng</b> để thêm luồng đầu tiên.</p>
      </div>

      <div v-else class="seq-list">
        <div v-for="seq in sequences" :key="seq.id" class="seq-card" :class="{ off: !seq.enabled }">
          <div class="seq-main">
            <div class="seq-head">
              <span class="seq-name">{{ seq.name }}</span>
              <span class="seq-badge" :class="seq.enabled ? 'on' : 'off'">
                {{ seq.enabled ? 'Đang bật' : 'Đang tắt' }}
              </span>
              <span class="seq-count">{{ seq.stepCount }} bước</span>
            </div>
            <div v-if="seq.description" class="seq-desc">{{ seq.description }}</div>
            <ol class="seq-steps">
              <li v-for="(step, idx) in seq.steps.slice(0, 3)" :key="idx">
                <span class="step-time">{{ idx === 0 ? 'Ngay' : delayLabel(step.delayMinutes) }}</span>
                <span class="step-text">{{ step.text }}</span>
                <span v-if="step.imageUrl" class="step-img-flag" title="Có ảnh kèm">🖼️</span>
              </li>
            </ol>
          </div>
          <div class="seq-actions">
            <button class="btn btn-ghost btn-sm" @click="openEdit(seq)">
              <v-icon size="16">mdi-pencil-outline</v-icon>
            </button>
            <button class="btn btn-ghost btn-sm" @click="toggleEnabled(seq)">
              <v-icon size="16">{{ seq.enabled ? 'mdi-pause-circle-outline' : 'mdi-play-circle-outline' }}</v-icon>
            </button>
            <button class="btn btn-ghost btn-sm danger" @click="removeSequence(seq)">
              <v-icon size="16">mdi-trash-can-outline</v-icon>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="modal.open" class="seq-overlay" @click.self="modal.open = false">
      <div class="seq-modal">
        <div class="seq-modal-head">
            <b>{{ modal.id ? 'Sửa luồng kịch bản' : 'Tạo luồng kịch bản' }}</b>
          <button class="btn-x" @click="modal.open = false"><v-icon size="18">mdi-close</v-icon></button>
        </div>

        <label class="f-label">Tên luồng</label>
        <input v-model="form.name" class="f-input" placeholder="VD: Chăm khách sau báo giá" />

        <label class="f-label">Mô tả</label>
        <input v-model="form.description" class="f-input" placeholder="Ghi chú ngắn để sale dễ chọn đúng luồng" />

        <label class="f-check">
          <input v-model="form.enabled" type="checkbox" />
          Bật luồng này để hiện trong Follow-up
        </label>

        <div class="steps-head">
          <label class="f-label">Các bước tin nhắn</label>
          <button type="button" class="btn btn-ghost btn-sm" @click="addStep">
            <v-icon size="15">mdi-plus</v-icon> Thêm bước
          </button>
        </div>

        <div class="step-editor" v-for="(step, idx) in form.steps" :key="idx">
          <div class="step-editor-head">
            <b>Bước {{ idx + 1 }}</b>
            <div class="step-actions">
              <button type="button" class="btn-ic" :disabled="idx === 0" title="Lên" @click="moveStep(idx, -1)">
                <v-icon size="15">mdi-arrow-up</v-icon>
              </button>
              <button type="button" class="btn-ic" :disabled="idx === form.steps.length - 1" title="Xuống" @click="moveStep(idx, 1)">
                <v-icon size="15">mdi-arrow-down</v-icon>
              </button>
              <button v-if="form.steps.length > 1" type="button" class="btn-ic danger" title="Xoá bước" @click="removeStep(idx)">
                <v-icon size="15">mdi-close</v-icon>
              </button>
            </div>
          </div>
          <label class="f-label small">Gửi sau</label>
          <select v-model.number="step.delayMinutes" class="f-input">
            <option :value="0">Ngay khi gắn luồng</option>
            <option :value="60">Sau 1 giờ</option>
            <option :value="360">Sau 6 giờ</option>
            <option :value="1440">Sau 1 ngày</option>
            <option :value="2880">Sau 2 ngày</option>
            <option :value="10080">Sau 7 ngày</option>
          </select>
          <label class="f-label small">Nội dung</label>
          <div class="step-block-row">
            <select class="f-input f-block-pick" :value="step.blockId ?? ''" @change="applyBlock(idx, ($event.target as HTMLSelectElement).value)">
              <option value="">— Nhập tay hoặc chọn Khối nội dung —</option>
              <option v-for="b in sendableBlocks" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
            <span v-if="step.blockId" class="step-block-tag" title="Nội dung lấy từ Khối nội dung; có thể sửa tay bên dưới">
              <v-icon size="13">mdi-view-grid-plus-outline</v-icon> từ khối
            </span>
          </div>
          <textarea v-model="step.text" class="f-input f-area" rows="3"
            placeholder="VD: Em chào Anh/Chị, bên em gửi thêm thông tin sản phẩm..."></textarea>
          <div v-if="step.imageUrl" class="step-img-row">
            <img :src="step.imageUrl" class="step-img-thumb" alt="Ảnh kèm bước" />
            <span class="step-img-note">Ảnh kèm (gửi cùng chữ làm chú thích)</span>
            <button type="button" class="btn btn-ghost btn-sm" @click="step.imageUrl = null">
              <v-icon size="14">mdi-image-off-outline</v-icon> Bỏ ảnh
            </button>
          </div>
        </div>

        <div class="seq-modal-foot">
          <button class="btn btn-ghost btn-sm" @click="modal.open = false">Hủy</button>
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveSequence">
            {{ saving ? 'Đang lưu...' : 'Lưu luồng' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';

const { push: toast } = useToast();
const { confirm } = useConfirm();

type StepRow = { text: string; delayMinutes: number; styles?: unknown[]; blockId?: string | null; imageUrl?: string | null };
type SequenceRow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  stepCount: number;
  steps: StepRow[];
};
type SendableBlock = { id: string; name: string; messageText: string; imageUrl?: string | null };

const sequences = ref<SequenceRow[]>([]);
const sendableBlocks = ref<SendableBlock[]>([]);
const loading = ref(true);
const saving = ref(false);
const modal = reactive<{ open: boolean; id: string | null }>({ open: false, id: null });
const form = reactive<{ name: string; description: string; enabled: boolean; steps: StepRow[] }>({
  name: '',
  description: '',
  enabled: true,
  steps: [{ text: '', delayMinutes: 0, blockId: null, imageUrl: null }],
});

// Khối nội dung loại 'gửi tin' đang BẬT — để ghép vào bước luồng. Lỗi tải khối không
// chặn CRUD luồng (vẫn nhập tay được) nên nuốt lỗi, chỉ để danh sách rỗng.
async function loadBlocks(): Promise<void> {
  try {
    const res = await api.get('/content-blocks', { params: { type: 'send_message', enabled: 'true' } });
    sendableBlocks.value = (res.data.blocks ?? []).map((b: any) => ({ id: b.id, name: b.name, messageText: b.messageText ?? '', imageUrl: b.imageUrl ?? null }));
  } catch { sendableBlocks.value = []; }
}

// Chọn 1 khối cho bước: điền text từ khối (nếu bước đang trống) + gắn blockId để hiển thị
// nguồn + gán ảnh theo khối (ảnh không gõ tay). Bỏ chọn (value rỗng) → gỡ blockId + ảnh,
// giữ nguyên text đang có.
function applyBlock(idx: number, blockId: string): void {
  const step = form.steps[idx];
  if (!step) return;
  if (!blockId) { step.blockId = null; step.imageUrl = null; return; }
  const block = sendableBlocks.value.find((b) => b.id === blockId);
  step.blockId = blockId;
  step.imageUrl = block?.imageUrl ?? null;
  if (block && !step.text.trim()) step.text = block.messageText;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await api.get('/automation/sequences');
    sequences.value = (res.data.sequences ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      enabled: s.enabled !== false,
      stepCount: s.stepCount ?? (s.steps?.length ?? 0),
      steps: (s.steps ?? []).map((st: any) => ({
        text: String(st.text ?? st.content ?? st.messageText ?? ''),
        delayMinutes: Number(st.delayMinutes ?? 0) || 0,
        styles: Array.isArray(st.styles) ? st.styles : [],
        blockId: typeof st.blockId === 'string' ? st.blockId : null,
        imageUrl: typeof st.imageUrl === 'string' ? st.imageUrl : null,
      })),
    }));
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  modal.id = null;
  Object.assign(form, {
    name: '',
    description: '',
    enabled: true,
    steps: [{ text: '', delayMinutes: 0, blockId: null, imageUrl: null }],
  });
  modal.open = true;
}

function openEdit(seq: SequenceRow): void {
  modal.id = seq.id;
  Object.assign(form, {
    name: seq.name,
    description: seq.description ?? '',
    enabled: seq.enabled,
    steps: seq.steps.length ? seq.steps.map((s) => ({ ...s })) : [{ text: '', delayMinutes: 0, blockId: null, imageUrl: null }],
  });
  modal.open = true;
}

function addStep(): void {
  form.steps.push({ text: '', delayMinutes: form.steps.length === 0 ? 0 : 1440, blockId: null, imageUrl: null });
}

function removeStep(idx: number): void {
  form.steps.splice(idx, 1);
}

// Đổi thứ tự bước — thứ tự này chính là thứ tự gửi (worker chạy tuần tự theo mảng).
function moveStep(idx: number, dir: -1 | 1): void {
  const to = idx + dir;
  if (to < 0 || to >= form.steps.length) return;
  const [moved] = form.steps.splice(idx, 1);
  form.steps.splice(to, 0, moved);
}

async function saveSequence(): Promise<void> {
  const name = form.name.trim();
  const steps = form.steps.map((s, idx) => ({
    text: s.text.trim(),
    delayMinutes: idx === 0 ? 0 : Math.max(0, Number(s.delayMinutes) || 0),
    styles: s.styles ?? [],
    blockId: s.blockId ?? null,
    imageUrl: s.imageUrl ?? null,
  })).filter((s) => s.text);
  if (!name) return void toast('Nhap ten luong', 'error');
  if (!steps.length) return void toast('Nhap it nhat 1 buoc tin nhan', 'error');

  saving.value = true;
  try {
    const payload = { name, description: form.description.trim(), enabled: form.enabled, steps };
    if (modal.id) await api.patch(`/automation/sequences/${modal.id}`, payload);
    else await api.post('/automation/sequences', payload);
    toast('Da luu luong kich ban', 'success');
    modal.open = false;
    await load();
  } catch (err: any) {
    toast(`Loi: ${err?.response?.data?.error ?? 'khong luu duoc luong'}`, 'error');
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(seq: SequenceRow): Promise<void> {
  await api.patch(`/automation/sequences/${seq.id}`, { enabled: !seq.enabled });
  await load();
}

async function removeSequence(seq: SequenceRow): Promise<void> {
  if (!(await confirm({
    title: 'Xoa luong?',
    message: `Xoa "${seq.name}". Neu luong dang gan cho khach, he thong se tat luong thay vi xoa.`,
    confirmText: 'Xoa',
    tone: 'danger',
  }))) return;
  await api.delete(`/automation/sequences/${seq.id}`);
  toast('Da xu ly luong', 'success');
  await load();
}

function delayLabel(minutes: number): string {
  if (!minutes) return 'Ngay';
  if (minutes < 60) return `${minutes} phut`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} gio`;
  return `${Math.round(minutes / 1440)} ngay`;
}

onMounted(() => { void load(); void loadBlocks(); });
</script>

<style scoped>
.seq-view { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.mkt-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 20px 12px; border-bottom: 1px solid var(--border, #e5e4e7); }
.mtt { font-size: 18px; font-weight: 700; }
.mts { font-size: 13px; color: var(--text-secondary, #666); margin-top: 2px; max-width: 760px; line-height: 1.5; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.seq-body { padding: 16px 20px; }
.seq-empty { text-align: center; color: var(--text-secondary, #888); padding: 42px 0; }
.seq-list { display: flex; flex-direction: column; gap: 10px; }
.seq-card { display: flex; justify-content: space-between; gap: 14px; border: 1px solid var(--border, #e5e4e7); border-radius: 10px; padding: 12px 14px; background: var(--surface, #fff); }
.seq-card.off { opacity: .72; }
.seq-main { min-width: 0; flex: 1; }
.seq-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.seq-name { font-weight: 700; }
.seq-badge, .seq-count { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.seq-badge.on { background: #e1f5e9; color: #1b7a3d; }
.seq-badge.off { background: #ececf0; color: #555; }
.seq-count { background: #eef2f7; color: #4b5563; }
.seq-desc { margin-top: 5px; color: var(--text-secondary, #666); font-size: 13px; }
.seq-steps { margin: 8px 0 0; padding-left: 20px; color: #42526e; font-size: 13px; }
.seq-steps li { margin: 4px 0; }
.step-time { display: inline-block; min-width: 74px; color: #0f6ea3; font-weight: 600; }
.step-text { color: var(--text, #333); }
.seq-actions { display: flex; gap: 4px; align-items: flex-start; flex-shrink: 0; }
.danger { color: #a12318; }

.seq-overlay { position: fixed; inset: 0; background: rgba(20, 20, 30, .45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.seq-modal { background: var(--surface, #fff); border-radius: 12px; padding: 18px 20px; width: 640px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); overflow: auto; }
.seq-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 15px; }
.btn-x, .btn-ic { background: none; border: none; cursor: pointer; padding: 2px; border-radius: 6px; }
.btn-ic:hover { background: rgba(15, 111, 160, .1); }
.btn-ic:disabled { opacity: .35; cursor: not-allowed; }
.step-actions { display: inline-flex; gap: 2px; align-items: center; }
.f-label { display: block; font-size: 12.5px; font-weight: 600; margin: 10px 0 4px; }
.f-label.small { margin-top: 8px; }
.f-input { width: 100%; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 7px 10px; font-size: 13.5px; background: var(--surface, #fff); color: inherit; }
.f-area { resize: vertical; font-family: inherit; line-height: 1.5; }
.f-check { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-size: 13px; color: #42526e; }
.steps-head { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.step-editor { border: 1px solid var(--border, #e5e4e7); border-radius: 10px; padding: 10px 12px; margin-top: 8px; background: #fbfcfd; }
.step-editor-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.step-block-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.f-block-pick { flex: 1; }
.step-block-tag { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 600; color: #0f6fa0; background: #eef6fb; border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
.step-img-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.step-img-thumb { width: 46px; height: 46px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border, #e5e4e7); }
.step-img-note { font-size: 12px; color: var(--text-secondary, #666); flex: 1; }
.step-img-flag { margin-left: 4px; font-size: 12px; }
.seq-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
