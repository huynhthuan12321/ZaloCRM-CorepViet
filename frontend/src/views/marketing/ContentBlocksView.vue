<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  ContentBlocksView — Khối nội dung (Community, Phase 3).
  Kho nội dung tái dùng cho Broadcast tự động + Luồng kịch bản. Phase 3 thêm:
  loại khối (gửi tin / lời mời kết bạn / đổi trạng thái), biến thể (xoay vòng chống spam),
  tag, bật/tắt, tìm/lọc. Backend: /api/v1/content-blocks (CRUD thật, org-scoped).
  AN TOÀN: chỉ soạn nội dung — KHÔNG gửi Zalo. Dry-run label nhắc trạng thái production.
-->
<template>
  <div class="cb-view">
    <div class="mkt-top">
      <div>
        <div class="mtt">
          Khối nội dung
          <span v-if="dryRun" class="dry-badge" title="Production đang bật dry-run — khối nội dung chỉ là dữ liệu, không tự gửi">
            <v-icon size="13">mdi-shield-check-outline</v-icon> Dry-run · không gửi thật
          </span>
        </div>
        <div class="mts">
          Soạn sẵn các mẫu tin (nhiều <b>biến thể</b> để xoay vòng chống spam) cho
          <b>Broadcast</b> và <b>Luồng kịch bản</b> dùng lại.
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="openCreate">
          <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo khối nội dung
        </button>
      </div>
    </div>

    <!-- Thanh tìm/lọc -->
    <div class="cb-toolbar">
      <div class="cb-search">
        <v-icon size="16">mdi-magnify</v-icon>
        <input v-model="filters.q" class="cb-search-input" placeholder="Tìm theo tên / nội dung…" @input="debouncedLoad" />
      </div>
      <select v-model="filters.type" class="cb-select" @change="load">
        <option value="">Tất cả loại</option>
        <option v-for="t in BLOCK_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <select v-model="filters.enabled" class="cb-select" @change="load">
        <option value="">Bật & tắt</option>
        <option value="true">Đang bật</option>
        <option value="false">Đang tắt</option>
      </select>
    </div>

    <div class="cb-body">
      <div v-if="loading" class="cb-empty">Đang tải…</div>
      <div v-else-if="error" class="cb-empty cb-error">
        <v-icon size="34">mdi-alert-circle-outline</v-icon>
        <p>{{ error }}</p>
        <button class="btn btn-ghost btn-sm" @click="load">Thử lại</button>
      </div>
      <div v-else-if="blocks.length === 0" class="cb-empty">
        <v-icon size="40">mdi-view-grid-plus-outline</v-icon>
        <p v-if="hasActiveFilter">Không có khối nào khớp bộ lọc.</p>
        <p v-else>Chưa có khối nội dung nào. Bấm <b>Tạo khối nội dung</b> để bắt đầu.</p>
      </div>

      <div v-else class="cb-grid">
        <div v-for="b in blocks" :key="b.id" class="cb-card" :class="{ off: !b.enabled }">
          <img v-if="b.imageUrl" :src="b.imageUrl" class="cb-thumb" />
          <div class="cb-card-body">
            <div class="cb-name">
              {{ b.name }}
              <span class="cb-type" :class="'t-' + b.blockType">{{ typeLabel(b.blockType) }}</span>
            </div>
            <div class="cb-text">{{ b.messageText }}</div>
            <div class="cb-tags" v-if="b.tags?.length">
              <span v-for="t in b.tags" :key="t" class="cb-tag">{{ t }}</span>
            </div>
            <div class="cb-meta">
              <span v-if="(b.variants?.length ?? 0) > 1"><v-icon size="12">mdi-shuffle-variant</v-icon> {{ b.variants.length }} biến thể</span>
              <span>Dùng {{ b.usageCount }} lần</span>
              <span v-if="!b.enabled" class="cb-off-badge">Đã tắt</span>
            </div>
          </div>
          <div class="cb-card-actions">
            <button class="btn btn-ghost btn-sm" :title="b.enabled ? 'Tắt khối' : 'Bật khối'" @click="toggleEnabled(b)">
              <v-icon size="16">{{ b.enabled ? 'mdi-toggle-switch' : 'mdi-toggle-switch-off-outline' }}</v-icon>
            </button>
            <button class="btn btn-ghost btn-sm" title="Sửa" @click="openEdit(b)">
              <v-icon size="16">mdi-pencil-outline</v-icon>
            </button>
            <button class="btn btn-ghost btn-sm danger" title="Xoá" @click="removeBlock(b)">
              <v-icon size="16">mdi-trash-can-outline</v-icon>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ Modal tạo/sửa khối nội dung ============ -->
    <div v-if="showForm" class="cb-overlay" @click.self="showForm = false">
      <div class="cb-modal">
        <div class="cb-modal-head">
          <b>{{ editing ? 'Sửa khối nội dung' : 'Tạo khối nội dung' }}</b>
          <button class="btn-x" @click="showForm = false"><v-icon size="18">mdi-close</v-icon></button>
        </div>

        <label class="f-label">Tên khối</label>
        <input v-model="form.name" class="f-input" placeholder="VD: Ưu đãi tháng 7 - mẫu 1" />

        <label class="f-label">Loại khối</label>
        <select v-model="form.blockType" class="f-input">
          <option v-for="t in BLOCK_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <div class="f-hint">{{ typeHint(form.blockType) }}</div>

        <div class="var-head">
          <label class="f-label">Biến thể nội dung <span class="f-hint">— biến: <code v-pre>{{ten}}</code>, <code v-pre>{{sdt}}</code></span></label>
          <button type="button" class="btn btn-ghost btn-sm" @click="addVariant">
            <v-icon size="15">mdi-plus</v-icon> Thêm biến thể
          </button>
        </div>
        <div v-for="(v, idx) in form.variants" :key="idx" class="var-editor">
          <div class="var-editor-head">
            <b>Biến thể {{ idx + 1 }}</b>
            <button v-if="form.variants.length > 1" type="button" class="btn-ic danger" title="Xoá biến thể" @click="removeVariant(idx)">
              <v-icon size="15">mdi-close</v-icon>
            </button>
          </div>
          <textarea v-model="v.text" class="f-input f-area" rows="3"
            placeholder="Chào {{ten}}, bên em đang có chương trình ưu đãi…"></textarea>
          <div class="f-image-row">
            <img v-if="v.imageUrl" :src="v.imageUrl" class="f-image-preview" />
            <div class="f-image-actions">
              <button type="button" class="btn btn-ghost btn-sm" @click="openMediaPicker(idx)">
                <v-icon size="16">mdi-image-multiple-outline</v-icon> {{ v.imageUrl ? 'Đổi ảnh' : 'Chọn ảnh' }}
              </button>
              <button v-if="v.imageUrl" type="button" class="btn btn-ghost btn-sm danger" @click="v.imageUrl = ''">
                <v-icon size="16">mdi-close</v-icon> Bỏ ảnh
              </button>
            </div>
          </div>
        </div>

        <label class="f-label">Tag (phân cách bằng dấu phẩy)</label>
        <input v-model="form.tagsText" class="f-input" placeholder="VD: uu-dai, thang-7" />

        <label class="f-check">
          <input v-model="form.enabled" type="checkbox" />
          Bật khối này (hiện trong picker Broadcast / Luồng kịch bản)
        </label>

        <div class="cb-modal-foot">
          <button class="btn btn-ghost btn-sm" @click="showForm = false">Huỷ</button>
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="save">
            {{ saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo khối' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ============ Modal chọn ảnh từ Kho media ============ -->
    <div v-if="mediaPicker.open" class="cb-overlay" @click.self="mediaPicker.open = false">
      <div class="cb-modal cb-modal-wide">
        <div class="cb-modal-head">
          <b>Chọn ảnh từ Kho media</b>
          <button class="btn-x" @click="mediaPicker.open = false"><v-icon size="18">mdi-close</v-icon></button>
        </div>
        <div v-if="mediaPicker.loading" class="cb-empty">Đang tải…</div>
        <div v-else-if="mediaPicker.items.length === 0" class="cb-empty">Kho media chưa có ảnh nào.</div>
        <div v-else class="f-media-grid">
          <button v-for="m in mediaPicker.items" :key="m.id" type="button" class="f-media-item" @click="selectMedia(m)">
            <img :src="m.thumbnailUrl || m.url || ''" :alt="m.name" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/api/index';
import { listMedia, type MediaAssetItem } from '@/api/media';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import { marketingDryRunEnabled } from '@/utils/marketingFeatureFlags';

const { push: toast } = useToast();
const { confirm } = useConfirm();

const dryRun = marketingDryRunEnabled;

type Variant = { text: string; imageUrl: string | null };
interface BlockRow {
  id: string; name: string; messageText: string; imageUrl: string | null;
  usageCount: number; blockType: string; variants: Variant[]; tags: string[]; enabled: boolean;
}

const BLOCK_TYPE_OPTIONS = [
  { value: 'send_message', label: 'Gửi tin nhắn' },
  { value: 'request_friend', label: 'Lời mời kết bạn' },
  { value: 'status_change', label: 'Đổi trạng thái' },
];
function typeLabel(t: string): string { return BLOCK_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t; }
function typeHint(t: string): string {
  if (t === 'request_friend') return 'Nội dung lời mời kết bạn (dùng cho Mục tiêu auto kết bạn).';
  if (t === 'status_change') return 'Ghi chú thao tác đổi trạng thái — không gửi tin cho khách.';
  return 'Tin nhắn gửi cho khách (Broadcast / Luồng kịch bản).';
}

// Biến hợp lệ khớp backend (content-block-helpers.BLOCK_VARS + broadcast-service.renderMessage).
const BLOCK_VARS = ['ten', 'ten_khach', 'sdt', 'phone'];
function unknownVars(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((v) => !BLOCK_VARS.includes(v)))];
}

const blocks = ref<BlockRow[]>([]);
const loading = ref(true);
const error = ref('');
const showForm = ref(false);
const saving = ref(false);
const editing = ref<BlockRow | null>(null);

const filters = reactive({ q: '', type: '', enabled: '' });
const hasActiveFilter = computed(() => !!(filters.q || filters.type || filters.enabled));

const form = reactive<{ name: string; blockType: string; variants: Variant[]; tagsText: string; enabled: boolean }>({
  name: '', blockType: 'send_message', variants: [{ text: '', imageUrl: '' }], tagsText: '', enabled: true,
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, string> = {};
    if (filters.q.trim()) params.q = filters.q.trim();
    if (filters.type) params.type = filters.type;
    if (filters.enabled) params.enabled = filters.enabled;
    const res = await api.get('/content-blocks', { params });
    blocks.value = (res.data.blocks ?? []).map((b: any) => ({
      id: b.id, name: b.name, messageText: b.messageText, imageUrl: b.imageUrl ?? null,
      usageCount: b.usageCount ?? 0, blockType: b.blockType ?? 'send_message',
      variants: Array.isArray(b.variants) ? b.variants : [], tags: Array.isArray(b.tags) ? b.tags : [],
      enabled: b.enabled !== false,
    }));
  } catch (err: any) {
    error.value = err?.response?.data?.error ?? 'Không tải được danh sách khối nội dung.';
  } finally {
    loading.value = false;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoad(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 300);
}

function openCreate(): void {
  editing.value = null;
  Object.assign(form, { name: '', blockType: 'send_message', variants: [{ text: '', imageUrl: '' }], tagsText: '', enabled: true });
  showForm.value = true;
}

function openEdit(b: BlockRow): void {
  editing.value = b;
  const variants = b.variants.length ? b.variants.map((v) => ({ text: v.text, imageUrl: v.imageUrl ?? '' }))
    : [{ text: b.messageText, imageUrl: b.imageUrl ?? '' }];
  Object.assign(form, {
    name: b.name, blockType: b.blockType, variants, tagsText: (b.tags ?? []).join(', '), enabled: b.enabled,
  });
  showForm.value = true;
}

function addVariant(): void { form.variants.push({ text: '', imageUrl: '' }); }
function removeVariant(idx: number): void { form.variants.splice(idx, 1); }

async function save(): Promise<void> {
  if (!form.name.trim()) return void toast('Nhập tên khối', 'error');
  const variants = form.variants
    .map((v) => ({ text: v.text.trim(), imageUrl: v.imageUrl?.trim() || null }))
    .filter((v) => v.text || v.imageUrl);
  if (!variants.length) return void toast('Nhập ít nhất 1 biến thể có nội dung', 'error');
  const bad = [...new Set(variants.flatMap((v) => unknownVars(v.text)))];
  if (bad.length) {
    return void toast(`Biến không hợp lệ: ${bad.map((v) => `{{${v}}}`).join(', ')}. Chỉ dùng {{ten}}, {{ten_khach}}, {{sdt}}, {{phone}}.`, 'error');
  }

  const tags = form.tagsText.split(',').map((t) => t.trim()).filter(Boolean);
  saving.value = true;
  try {
    const payload = { name: form.name, blockType: form.blockType, variants, tags, enabled: form.enabled };
    if (editing.value) await api.patch(`/content-blocks/${editing.value.id}`, payload);
    else await api.post('/content-blocks', payload);
    toast(editing.value ? 'Đã lưu thay đổi' : 'Đã tạo khối nội dung', 'success');
    showForm.value = false;
    await load();
  } catch (err: any) {
    const code = err?.response?.data?.error;
    const vars = err?.response?.data?.vars;
    toast(code === 'unknown_vars' && Array.isArray(vars)
      ? `Biến không hợp lệ: ${vars.map((v: string) => `{{${v}}}`).join(', ')}`
      : `Lỗi: ${code ?? 'không lưu được'}`, 'error');
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(b: BlockRow): Promise<void> {
  try {
    await api.patch(`/content-blocks/${b.id}`, { enabled: !b.enabled });
    await load();
  } catch { toast('Không đổi được trạng thái', 'error'); }
}

async function removeBlock(b: BlockRow): Promise<void> {
  if (!(await confirm({
    title: 'Xoá khối nội dung?',
    message: `Xoá "${b.name}". Broadcast/Luồng đang dùng khối này sẽ tự bỏ qua nó. Không thể hoàn tác.`,
    confirmText: 'Xoá', tone: 'danger',
  }))) return;
  await api.delete(`/content-blocks/${b.id}`);
  toast('Đã xoá', 'success');
  await load();
}

const mediaPicker = reactive({ open: false, loading: false, items: [] as MediaAssetItem[], targetIdx: 0 });

async function openMediaPicker(idx: number): Promise<void> {
  mediaPicker.targetIdx = idx;
  mediaPicker.open = true;
  mediaPicker.loading = true;
  try {
    mediaPicker.items = await listMedia({ kind: 'image', limit: 60, sort: 'recent' });
  } finally {
    mediaPicker.loading = false;
  }
}

function selectMedia(m: MediaAssetItem): void {
  const target = form.variants[mediaPicker.targetIdx];
  if (target) target.imageUrl = m.url ?? '';
  mediaPicker.open = false;
}

onMounted(load);
</script>

<style scoped>
.cb-view { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.mkt-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 20px 12px; border-bottom: 1px solid var(--border, #e5e4e7); }
.mtt { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dry-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: #8a5a00; background: #fff3d6; border: 1px solid #f0d999; padding: 2px 8px; border-radius: 999px; }
.mts { font-size: 13px; color: var(--text-secondary, #666); margin-top: 2px; max-width: 720px; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }
.cb-toolbar { display: flex; gap: 8px; padding: 10px 20px; border-bottom: 1px solid var(--border, #eee); flex-wrap: wrap; }
.cb-search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 4px 10px; flex: 1; min-width: 200px; }
.cb-search-input { border: none; outline: none; background: none; flex: 1; font-size: 13.5px; color: inherit; }
.cb-select { border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 5px 10px; font-size: 13px; background: var(--surface, #fff); color: inherit; }
.cb-body { padding: 16px 20px; }
.cb-empty { text-align: center; color: var(--text-secondary, #888); padding: 32px 0; }
.cb-error { color: #a12318; }
.cb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.cb-card { border: 1px solid var(--border, #e5e4e7); border-radius: 10px; overflow: hidden; background: var(--surface, #fff); display: flex; flex-direction: column; }
.cb-card.off { opacity: .62; }
.cb-thumb { width: 100%; height: 120px; object-fit: cover; }
.cb-card-body { padding: 10px 12px; flex: 1; }
.cb-name { font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.cb-type { font-size: 10.5px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: #eef2f7; color: #4b5563; white-space: nowrap; }
.cb-type.t-request_friend { background: #e6f0fb; color: #1f5fa8; }
.cb-type.t-status_change { background: #f2eafc; color: #7a3fb0; }
.cb-text { font-size: 12.5px; color: var(--text-secondary, #666); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cb-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.cb-tag { font-size: 10.5px; background: #eef6fb; color: #0f6fa0; border-radius: 999px; padding: 1px 7px; }
.cb-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 11.5px; color: var(--text-secondary, #999); margin-top: 6px; }
.cb-off-badge { color: #8a5a00; font-weight: 600; }
.cb-card-actions { display: flex; justify-content: flex-end; gap: 4px; padding: 6px 10px; border-top: 1px solid var(--border, #eee); }
.danger { color: #a12318; }

.cb-overlay { position: fixed; inset: 0; background: rgba(20, 20, 30, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.cb-modal { background: var(--surface, #fff); border-radius: 12px; padding: 18px 20px; width: 580px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); overflow: auto; }
.cb-modal-wide { width: 760px; }
.cb-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 15px; }
.btn-x { background: none; border: none; cursor: pointer; padding: 2px; }
.btn-ic { background: none; border: none; cursor: pointer; padding: 2px; border-radius: 6px; }
.cb-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.f-label { display: block; font-size: 12.5px; font-weight: 600; margin: 10px 0 4px; }
.f-hint { font-weight: 400; color: var(--text-secondary, #888); font-size: 12px; }
.f-input { width: 100%; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 7px 10px; font-size: 13.5px; background: var(--surface, #fff); color: inherit; }
.f-area { resize: vertical; font-family: inherit; line-height: 1.5; margin-top: 4px; }
.f-check { display: flex; align-items: center; gap: 8px; margin: 12px 0 2px; font-size: 13px; color: #42526e; }
.var-head { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.var-editor { border: 1px solid var(--border, #e5e4e7); border-radius: 10px; padding: 10px 12px; margin-top: 8px; background: #fbfcfd; }
.var-editor-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.f-image-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.f-image-preview { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border, #d5d4d8); flex-shrink: 0; }
.f-image-actions { display: flex; gap: 6px; }
.f-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; max-height: 60vh; overflow: auto; }
.f-media-item { border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 0; cursor: pointer; overflow: hidden; aspect-ratio: 1; background: none; }
.f-media-item:hover { border-color: #0e445a; }
.f-media-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
