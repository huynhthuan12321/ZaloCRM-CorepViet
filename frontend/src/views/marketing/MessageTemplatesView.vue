<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  MessageTemplatesView — Quản lý Mẫu tin nhắn nhanh (gõ "/" trong chat để chèn).
  CRUD template + folder + tag sản phẩm + biến động. Backend: /automation/templates
  + /automation/template-folders (qua composable use-message-templates).
-->
<template>
  <div class="mt-view">
    <div class="mkt-top">
      <div>
        <div class="mtt">Mẫu tin nhắn nhanh</div>
        <div class="mts">
          Kho mẫu tin để sale gõ <code>/</code> trong khung chat chèn nhanh. Hỗ trợ gõ tắt
          (shortcut), phân nhóm (folder), gắn sản phẩm (tag) và biến động
          <code v-pre>{name} {gender} {sale}…</code>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="openCreate">
          <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo mẫu
        </button>
      </div>
    </div>

    <div class="mt-body">
      <!-- ── Cột trái: folder ── -->
      <aside class="mt-folders">
        <div class="mt-fold-head">
          <span>Nhóm mẫu</span>
          <button class="btn-ic" title="Tạo nhóm" @click="createFolderPrompt">
            <v-icon size="16">mdi-folder-plus-outline</v-icon>
          </button>
        </div>
        <button class="mt-fold" :class="{ on: activeFolder === '' }" @click="activeFolder = ''">
          <v-icon size="15">mdi-inbox-multiple-outline</v-icon>
          <span class="mt-fold-name">Tất cả</span>
          <span class="mt-fold-count">{{ templates.length }}</span>
        </button>
        <button class="mt-fold" :class="{ on: activeFolder === '__none' }" @click="activeFolder = '__none'">
          <v-icon size="15">mdi-folder-outline</v-icon>
          <span class="mt-fold-name">Chưa phân nhóm</span>
        </button>
        <div v-for="f in folders" :key="f.id" class="mt-fold" :class="{ on: activeFolder === f.id }" @click="activeFolder = f.id">
          <v-icon size="15">mdi-folder-outline</v-icon>
          <span class="mt-fold-name">{{ f.name }}</span>
          <span class="mt-fold-count">{{ f._count?.templates ?? 0 }}</span>
          <span class="mt-fold-tools">
            <button class="btn-ic sm" title="Đổi tên" @click.stop="renameFolderPrompt(f)"><v-icon size="13">mdi-pencil-outline</v-icon></button>
            <button class="btn-ic sm danger" title="Xoá nhóm" @click.stop="removeFolder(f)"><v-icon size="13">mdi-trash-can-outline</v-icon></button>
          </span>
        </div>
      </aside>

      <!-- ── Cột phải: danh sách mẫu ── -->
      <section class="mt-main">
        <div class="mt-toolbar">
          <div class="mt-search">
            <v-icon size="16">mdi-magnify</v-icon>
            <input v-model="search" placeholder="Tìm theo tên / gõ tắt / nội dung…" />
          </div>
          <div class="mt-tagfilter">
            <button class="mt-tag" :class="{ on: !tagFilter }" @click="tagFilter = ''">Tất cả tag</button>
            <button v-for="t in PROJECT_TAGS" :key="t" class="mt-tag" :class="{ on: tagFilter === t }" @click="tagFilter = tagFilter === t ? '' : t">{{ shortTag(t) }}</button>
          </div>
        </div>

        <div v-if="loading" class="mt-empty">Đang tải…</div>
        <div v-else-if="visibleTemplates.length === 0" class="mt-empty">
          <v-icon size="40">mdi-message-flash-outline</v-icon>
          <p>Chưa có mẫu nào. Bấm <b>Tạo mẫu</b> để thêm mẫu tin đầu tiên.</p>
        </div>

        <div v-else class="mt-list">
          <div v-for="tpl in visibleTemplates" :key="tpl.id" class="mt-card">
            <div class="mt-card-main">
              <div class="mt-card-head">
                <span class="mt-name">{{ tpl.name }}</span>
                <span v-if="tpl.shortcut" class="mt-sc">/{{ tpl.shortcut }}</span>
                <span class="mt-vis" :class="tpl.visibility === 'private' ? 'v-priv' : 'v-pub'">
                  {{ tpl.visibility === 'private' ? 'Riêng tôi' : 'Chung' }}
                </span>
                <span v-for="tg in (tpl.tagIds || [])" :key="tg" class="mt-chip">{{ shortTag(tg) }}</span>
              </div>
              <div class="mt-content" :title="tpl.content">{{ plainOf(tpl) }}</div>
            </div>
            <div class="mt-card-actions">
              <button class="btn btn-ghost btn-sm" title="Sửa" @click="openEdit(tpl)"><v-icon size="16">mdi-pencil-outline</v-icon></button>
              <button class="btn btn-ghost btn-sm danger" title="Xoá" @click="removeTemplate(tpl)"><v-icon size="16">mdi-trash-can-outline</v-icon></button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Modal tạo/sửa mẫu ── -->
    <div v-if="modal.open" class="mt-overlay" @click.self="modal.open = false">
      <div class="mt-modal">
        <div class="mt-modal-head">
          <b>{{ modal.id ? 'Sửa mẫu tin' : 'Tạo mẫu tin' }}</b>
          <button class="btn-x" @click="modal.open = false"><v-icon size="18">mdi-close</v-icon></button>
        </div>

        <div class="f-row">
          <div class="f-col">
            <label class="f-label">Tên mẫu</label>
            <input v-model="form.name" class="f-input" placeholder="VD: Chào khách mới" />
          </div>
          <div class="f-col">
            <label class="f-label">Gõ tắt <span class="f-hint">— gõ /tên_tắt để chèn nhanh</span></label>
            <input v-model="form.shortcut" class="f-input" placeholder="chaomoi" />
          </div>
        </div>

        <div class="f-row">
          <div class="f-col">
            <label class="f-label">Nhóm</label>
            <select v-model="form.folderId" class="f-input">
              <option value="">— Chưa phân nhóm —</option>
              <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </div>
          <div class="f-col">
            <label class="f-label">Phạm vi</label>
            <select v-model="form.visibility" class="f-input">
              <option value="public">Chung (cả nhóm dùng)</option>
              <option value="private">Riêng tôi</option>
            </select>
          </div>
        </div>

        <label class="f-label">Tag sản phẩm</label>
        <div class="f-tags">
          <button v-for="t in PROJECT_TAGS" :key="t" type="button" class="mt-tag" :class="{ on: form.tagIds.includes(t) }" @click="toggleTag(t)">
            {{ shortTag(t) }}
          </button>
        </div>

        <label class="f-label">Nội dung <span class="f-hint">— bấm biến để chèn</span></label>
        <div class="f-vars">
          <button v-for="v in VARS" :key="v.token" type="button" class="f-var" :title="v.desc" @click="insertVar(v.token)">{{ v.token }}</button>
        </div>
        <textarea ref="contentEl" v-model="form.content" class="f-input f-area" rows="5"
          placeholder="Dạ em chào {gender} {name} ạ, em là {sale} bên..."></textarea>

        <div v-if="form.content.trim()" class="f-preview">
          <span class="f-preview-lbl">Xem trước:</span> {{ previewText }}
        </div>

        <div class="mt-modal-foot">
          <button class="btn btn-ghost btn-sm" @click="modal.open = false">Huỷ</button>
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="submit">
            {{ saving ? 'Đang lưu…' : (modal.id ? 'Lưu' : 'Tạo mẫu') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useMessageTemplates, type MessageTemplate } from '@/composables/use-message-templates';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';

const { push: toast } = useToast();
const { confirm } = useConfirm();

const {
  templates, folders, loading, saving,
  fetchTemplates, fetchFolders,
  createTemplate, updateTemplate, deleteTemplate,
  createFolder, updateFolder, deleteFolder,
} = useMessageTemplates();

// Tag sản phẩm — khớp PROJECT_TAGS của quick-template-popup (chip lọc trong chat).
const PROJECT_TAGS = ['Emerald Garden View', 'Emerald Boulevard', 'Emerald River Park', 'Monrei Sài Gòn'];
// 8 biến động — KHỚP backend render-template.ts + quick-template-popup.
const VARS = [
  { token: '{gender}', desc: 'Anh/Chị theo giới tính KH' },
  { token: '{name}', desc: 'Tên gọi (chữ cuối) của KH' },
  { token: '{name_full}', desc: 'Họ tên đầy đủ KH' },
  { token: '{crm_full}', desc: 'Tên gợi nhớ CRM (per-nick)' },
  { token: '{crm_first}', desc: 'Chữ đầu tên gợi nhớ CRM' },
  { token: '{crm_last}', desc: 'Chữ cuối tên gợi nhớ CRM' },
  { token: '{sale}', desc: 'Tên sale (chữ cuối)' },
  { token: '{sale_full}', desc: 'Tên sale đầy đủ' },
];

const search = ref('');
const tagFilter = ref('');
const activeFolder = ref('');
const contentEl = ref<HTMLTextAreaElement | null>(null);

const modal = reactive<{ open: boolean; id: string | null }>({ open: false, id: null });
const form = reactive<{ name: string; shortcut: string; folderId: string; visibility: 'public' | 'private'; tagIds: string[]; content: string }>(
  { name: '', shortcut: '', folderId: '', visibility: 'public', tagIds: [], content: '' },
);

function shortTag(tag: string): string { return tag.replace(/^Emerald\s+/, '').replace('Sài Gòn', 'SG'); }
function plainOf(t: MessageTemplate): string { return t.contentRich?.text ?? t.content ?? ''; }

const visibleTemplates = computed(() => {
  let list = templates.value;
  if (activeFolder.value === '__none') list = list.filter((t) => !t.folderId);
  else if (activeFolder.value) list = list.filter((t) => t.folderId === activeFolder.value);
  if (tagFilter.value) list = list.filter((t) => (t.tagIds || []).includes(tagFilter.value));
  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.shortcut || '').toLowerCase().includes(q) ||
      plainOf(t).toLowerCase().includes(q));
  }
  return list;
});

// Xem trước với dữ liệu mẫu (khách "Nguyễn Văn An", sale "Thuận").
const previewText = computed(() => {
  const repl: Record<string, string> = {
    '{gender}': 'Anh', '{name}': 'An', '{name_full}': 'Nguyễn Văn An',
    '{crm_full}': 'Nguyễn Văn An', '{crm_first}': 'Nguyễn', '{crm_last}': 'An',
    '{sale}': 'Thuận', '{sale_full}': 'Huỳnh Ngọc Thuận',
  };
  return form.content.replace(/\{(gender|name_full|name|crm_full|crm_first|crm_last|sale_full|sale)\}/g, (m) => repl[m] ?? m);
});

function toggleTag(t: string): void {
  const i = form.tagIds.indexOf(t);
  if (i >= 0) form.tagIds.splice(i, 1); else form.tagIds.push(t);
}

function insertVar(token: string): void {
  const el = contentEl.value;
  if (!el) { form.content += token; return; }
  const start = el.selectionStart ?? form.content.length;
  const end = el.selectionEnd ?? form.content.length;
  form.content = form.content.slice(0, start) + token + form.content.slice(end);
  // đặt lại con trỏ sau token đã chèn
  requestAnimationFrame(() => { el.focus(); const p = start + token.length; el.setSelectionRange(p, p); });
}

function openCreate(): void {
  modal.id = null;
  Object.assign(form, {
    name: '', shortcut: '', content: '', tagIds: [], visibility: 'public',
    folderId: activeFolder.value && activeFolder.value !== '__none' ? activeFolder.value : '',
  });
  modal.open = true;
}

function openEdit(t: MessageTemplate): void {
  modal.id = t.id;
  Object.assign(form, {
    name: t.name, shortcut: t.shortcut ?? '', content: plainOf(t),
    folderId: t.folderId ?? '', visibility: t.visibility ?? 'public', tagIds: [...(t.tagIds || [])],
  });
  modal.open = true;
}

async function submit(): Promise<void> {
  if (!form.name.trim()) return void toast('Nhập tên mẫu', 'error');
  if (!form.content.trim()) return void toast('Nhập nội dung mẫu', 'error');
  const payload: Partial<MessageTemplate> = {
    name: form.name.trim(),
    shortcut: form.shortcut.trim() || null,
    content: form.content,
    folderId: form.folderId || null,
    visibility: form.visibility,
    tagIds: form.tagIds,
  };
  try {
    if (modal.id) await updateTemplate(modal.id, payload);
    else await createTemplate(payload);
    toast(modal.id ? 'Đã lưu mẫu' : 'Đã tạo mẫu', 'success');
    modal.open = false;
    await reload();
  } catch (err: any) {
    toast(`Lỗi: ${err?.response?.data?.error ?? 'không lưu được'}`, 'error');
  }
}

async function removeTemplate(t: MessageTemplate): Promise<void> {
  if (!(await confirm({ title: 'Xoá mẫu?', message: `Xoá mẫu "${t.name}". Không thể hoàn tác.`, confirmText: 'Xoá', tone: 'danger' }))) return;
  await deleteTemplate(t.id);
  toast('Đã xoá', 'success');
  await reload();
}

async function createFolderPrompt(): Promise<void> {
  const name = window.prompt('Tên nhóm mẫu mới:')?.trim();
  if (!name) return;
  try {
    await createFolder({ name, visibility: 'public' });
    await fetchFolders();
    toast('Đã tạo nhóm', 'success');
  } catch (err: any) {
    toast(`Lỗi: ${err?.response?.data?.error ?? 'không tạo được nhóm'}`, 'error');
  }
}

async function renameFolderPrompt(f: { id: string; name: string }): Promise<void> {
  const name = window.prompt('Đổi tên nhóm:', f.name)?.trim();
  if (!name || name === f.name) return;
  await updateFolder(f.id, { name });
  await fetchFolders();
  toast('Đã đổi tên', 'success');
}

async function removeFolder(f: { id: string; name: string; _count?: { templates: number } }): Promise<void> {
  const has = f._count?.templates ?? 0;
  const msg = has > 0
    ? `Nhóm "${f.name}" đang có ${has} mẫu. Xoá nhóm sẽ gỡ nhóm khỏi các mẫu đó (mẫu vẫn còn). Tiếp tục?`
    : `Xoá nhóm "${f.name}"?`;
  if (!(await confirm({ title: 'Xoá nhóm?', message: msg, confirmText: 'Xoá', tone: 'danger' }))) return;
  try {
    await deleteFolder(f.id, has > 0);
    if (activeFolder.value === f.id) activeFolder.value = '';
    await reload();
    toast('Đã xoá nhóm', 'success');
  } catch (err: any) {
    toast(`Lỗi: ${err?.response?.data?.error ?? 'không xoá được nhóm'}`, 'error');
  }
}

async function reload(): Promise<void> {
  await Promise.all([fetchTemplates(), fetchFolders()]);
}

onMounted(reload);
</script>

<style scoped>
.mt-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.mkt-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px 20px 12px; border-bottom: 1px solid var(--border, #e5e4e7); }
.mtt { font-size: 18px; font-weight: 700; }
.mts { font-size: 13px; color: var(--text-secondary, #666); margin-top: 2px; max-width: 760px; line-height: 1.5; }
.mts code { background: #eef2f7; padding: 0 5px; border-radius: 4px; font-size: 12px; }
.actions { display: flex; gap: 8px; flex-shrink: 0; }

.mt-body { flex: 1 1 auto; min-height: 0; display: flex; }

/* Folder cột trái */
.mt-folders { flex: 0 0 220px; border-right: 1px solid var(--border, #e5e4e7); padding: 12px 8px; overflow: auto; }
.mt-fold-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px 8px; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
.mt-fold { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 8px; cursor: pointer; color: #44505c; font-size: 13.5px; text-align: left; }
.mt-fold:hover { background: rgba(15, 111, 160, 0.08); }
.mt-fold.on { background: rgba(15, 111, 160, 0.14); color: #0e445a; font-weight: 600; }
.mt-fold-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mt-fold-count { font-size: 11px; background: #eef2f7; color: #4b5563; padding: 0 6px; border-radius: 999px; }
.mt-fold-tools { display: none; gap: 2px; }
.mt-fold:hover .mt-fold-tools { display: flex; }

/* Danh sách mẫu cột phải */
.mt-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; padding: 12px 20px; overflow: auto; }
.mt-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.mt-search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 6px 10px; flex: 1; min-width: 220px; }
.mt-search input { border: none; outline: none; background: none; flex: 1; font-size: 13.5px; color: inherit; }
.mt-tagfilter { display: flex; gap: 6px; flex-wrap: wrap; }
.mt-tag { font-size: 11.5px; padding: 4px 10px; border: 1px solid #e3e6eb; background: #fff; border-radius: 999px; color: #4b5563; cursor: pointer; white-space: nowrap; }
.mt-tag:hover { border-color: #1786be; }
.mt-tag.on { background: #e6f3fb; border-color: #1786be; color: #0f6ea3; font-weight: 600; }

.mt-empty { text-align: center; color: var(--text-secondary, #888); padding: 40px 0; }
.mt-list { display: flex; flex-direction: column; gap: 8px; }
.mt-card { display: flex; justify-content: space-between; gap: 12px; border: 1px solid var(--border, #e5e4e7); border-radius: 10px; padding: 11px 14px; background: var(--surface, #fff); }
.mt-card-main { min-width: 0; flex: 1; }
.mt-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mt-name { font-weight: 700; }
.mt-sc { font-size: 11px; font-weight: 600; color: #0f6ea3; background: #eef6fb; padding: 1px 6px; border-radius: 5px; font-family: ui-monospace, monospace; }
.mt-vis { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; font-weight: 600; }
.v-pub { background: #e1f5e9; color: #1b7a3d; }
.v-priv { background: #fdf3d7; color: #8a6d00; }
.mt-chip { font-size: 10.5px; padding: 1px 7px; border-radius: 6px; background: #eef2f7; color: #4b5563; }
.mt-content { font-size: 13px; color: var(--text, #333); margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mt-card-actions { display: flex; gap: 4px; align-items: flex-start; flex-shrink: 0; }

.btn-ic { background: none; border: none; cursor: pointer; color: #6b7280; padding: 2px; border-radius: 6px; }
.btn-ic:hover { background: rgba(15, 111, 160, 0.1); }
.btn-ic.sm { padding: 1px; }
.btn-ic.danger { color: #a12318; }
.danger { color: #a12318; }

/* Modal */
.mt-overlay { position: fixed; inset: 0; background: rgba(20, 20, 30, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.mt-modal { background: var(--surface, #fff); border-radius: 12px; padding: 18px 20px; width: 620px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); overflow: auto; }
.mt-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 15px; }
.btn-x { background: none; border: none; cursor: pointer; padding: 2px; }
.mt-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.f-label { display: block; font-size: 12.5px; font-weight: 600; margin: 10px 0 4px; }
.f-hint { font-weight: 400; color: var(--text-secondary, #888); }
.f-input { width: 100%; border: 1px solid var(--border, #d5d4d8); border-radius: 8px; padding: 7px 10px; font-size: 13.5px; background: var(--surface, #fff); color: inherit; }
.f-area { resize: vertical; font-family: inherit; line-height: 1.5; }
.f-row { display: flex; gap: 10px; }
.f-col { flex: 1; min-width: 0; }
.f-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.f-vars { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.f-var { font-size: 11.5px; font-family: ui-monospace, monospace; padding: 3px 8px; border: 1px dashed #b9c2cc; background: #f7f9fc; border-radius: 6px; color: #0f6ea3; cursor: pointer; }
.f-var:hover { border-color: #1786be; background: #e6f3fb; }
.f-preview { margin-top: 10px; padding: 8px 11px; background: #f7f9fc; border: 1px solid #eef0f3; border-radius: 8px; font-size: 12.5px; color: #374151; line-height: 1.5; }
.f-preview-lbl { color: #9ca3af; font-weight: 600; font-size: 11px; }

@media (max-width: 768px) {
  .mt-body { flex-direction: column; }
  .mt-folders { flex: 0 0 auto; border-right: none; border-bottom: 1px solid var(--border, #e5e4e7); }
}
</style>
