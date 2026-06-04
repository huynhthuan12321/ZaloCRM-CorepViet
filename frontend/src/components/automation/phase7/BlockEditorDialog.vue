<!--
  BlockEditorDialog — Phase 1 MVP 2026-06-04 (Mockup 2 approved)
  3 cột: Components left + WYSIWYG middle + Zalo preview right.
  Variants tab 1/2/3 per text-message. Toggle Text/Rich text.
  AI generate variants defer tuần 2 (badge "Tuần 2").
  Folder visibility + Tag multi sub-bar.
-->
<template>
  <v-dialog
    :model-value="modelValue"
    fullscreen
    transition="dialog-bottom-transition"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="bed-wrap">
      <!-- Topbar -->
      <header class="bed-topbar">
        <button class="bed-back" @click="$emit('update:modelValue', false)">← Quay lại</button>
        <input
          v-model="draft.name"
          type="text"
          class="bed-name-input"
          placeholder="Tên Khối (vd: Intro dự án Sunshine Q7)"
        />
        <span v-if="saving" class="bed-save-status">⏳ Đang lưu...</span>
        <span v-else-if="lastSavedAt" class="bed-save-status">✓ Đã lưu {{ lastSavedHint }}</span>
        <div class="bed-actions">
          <button class="bed-btn bed-btn-primary" :disabled="saving" @click="onSave">💾 Lưu</button>
        </div>
      </header>

      <!-- Sub-bar: Folder + Tag -->
      <div class="bed-subbar">
        <div class="bed-sub-group">
          <span class="bed-sub-label">📂 Thư mục:</span>
          <select v-model="draft.folderId" class="bed-folder-select">
            <option :value="null">— Chưa chọn —</option>
            <option
              v-for="f in folders"
              :key="f.id"
              :value="f.id"
            >
              {{ f.visibility === 'private' ? '🔒' : '🔓' }} {{ f.name }}
            </option>
          </select>
          <span v-if="selectedFolderInfo" class="bed-vis-hint" :class="{ private: selectedFolderInfo.visibility === 'private' }">
            {{ selectedFolderInfo.visibility === 'private' ? '🔒 Riêng tư (chỉ tôi)' : '🔓 Công khai (cả org dùng)' }}
          </span>
        </div>
        <div class="bed-sub-divider"></div>
        <div class="bed-sub-group bed-tag-group">
          <span class="bed-sub-label">🏷 Tag:</span>
          <span
            v-for="tag in draft.tagIds"
            :key="tag"
            class="bed-tag-chip"
          >
            {{ tag }}
            <button class="bed-tag-x" @click="removeTag(tag)">✕</button>
          </span>
          <button class="bed-tag-add" @click="addTag">+ Thêm tag</button>
        </div>
        <div class="bed-sub-divider"></div>
        <div class="bed-sub-group">
          <span class="bed-sub-label">Loại:</span>
          <span class="bed-action-pill">{{ actionPillLabel }}</span>
          <select
            v-if="!isEdit"
            v-model="draft.actionType"
            class="bed-action-select"
          >
            <option value="send_message">📨 Gửi tin nhắn</option>
            <option value="request_friend">🤝 Mời kết bạn</option>
            <option value="update_status">🏷 Đổi trạng thái</option>
          </select>
        </div>
      </div>

      <!-- 3 cột body -->
      <div class="bed-body">
        <!-- Col 1: Components list (chỉ cho send_message) -->
        <aside v-if="draft.actionType === 'send_message'" class="bed-col1">
          <div class="bed-col1-head">
            <span class="bed-col1-title">Thành phần ({{ components.length }})</span>
            <button class="bed-add-btn" @click="addComponentMenu = !addComponentMenu">+ Thêm ▾</button>
            <div v-if="addComponentMenu" class="bed-add-menu" @click.stop>
              <button @click="addComponent('text')">📝 Tin text</button>
              <button @click="addComponent('image')">🖼️ Hình</button>
              <button @click="addComponent('album')">🎞️ Album</button>
              <button @click="addComponent('file')">📎 File</button>
              <button @click="addComponent('video')">🎬 Video</button>
            </div>
          </div>
          <div class="bed-comp-list">
            <div
              v-for="(c, idx) in components"
              :key="idx"
              class="bed-comp-item"
              :class="{ active: activeComponentIdx === idx }"
              @click="activeComponentIdx = idx"
            >
              <span class="bed-comp-drag">☰</span>
              <span class="bed-comp-icon">{{ componentIcon(c.kind) }}</span>
              <div class="bed-comp-info">
                <div class="bed-comp-name">{{ componentLabel(c) }}</div>
                <div class="bed-comp-meta">{{ componentMeta(c) }}</div>
              </div>
              <button class="bed-comp-x" @click.stop="removeComponent(idx)">✕</button>
            </div>
            <div v-if="components.length === 0" class="bed-comp-empty">
              Chưa có thành phần. Bấm "+ Thêm" để thêm tin text / hình / file.
            </div>
          </div>
        </aside>

        <!-- Col 1 alt: request_friend variants list -->
        <aside v-else-if="draft.actionType === 'request_friend'" class="bed-col1">
          <div class="bed-col1-head">
            <span class="bed-col1-title">Biến thể ({{ greetingVariants.length }})</span>
            <button class="bed-add-btn" @click="addGreeting">+ Thêm</button>
          </div>
          <div class="bed-comp-list">
            <div
              v-for="(g, idx) in greetingVariants"
              :key="idx"
              class="bed-comp-item"
              :class="{ active: activeGreetingIdx === idx }"
              @click="activeGreetingIdx = idx"
            >
              <span class="bed-comp-icon">{{ idx === 0 ? '★' : '🎲' }}</span>
              <div class="bed-comp-info">
                <div class="bed-comp-name">Biến thể {{ idx + 1 }} {{ idx === 0 ? '(mặc định)' : '' }}</div>
                <div class="bed-comp-meta">{{ (g || '').length }} chars</div>
              </div>
              <button v-if="greetingVariants.length > 1" class="bed-comp-x" @click.stop="removeGreeting(idx)">✕</button>
            </div>
          </div>
        </aside>

        <!-- Col 2: Editor -->
        <section class="bed-col2">
          <!-- send_message: tin text editor with variants tab -->
          <template v-if="draft.actionType === 'send_message' && activeComponent && activeComponent.kind === 'text'">
            <div class="bed-variant-bar">
              <button
                v-for="(_v, idx) in textVariantsForActive"
                :key="idx"
                class="bed-var-tab"
                :class="{ active: activeVariantIdx === idx }"
                @click="activeVariantIdx = idx"
              >
                <span v-if="idx === 0" class="bed-var-star">★</span>
                Biến thể {{ idx + 1 }}
                <span v-if="idx === 0" class="bed-var-default">mặc định</span>
              </button>
              <button class="bed-var-tab bed-var-add" @click="addTextVariant">+ Thêm</button>
              <button class="bed-ai-btn" disabled>
                ✨ AI tạo biến thể
                <span class="bed-ai-soon">Tuần 2</span>
              </button>
            </div>

            <div class="bed-toggle-row">
              <span class="bed-toggle-label">Định dạng:</span>
              <div class="bed-toggle">
                <button
                  class="bed-toggle-btn"
                  :class="{ active: !isRichMode }"
                  @click="isRichMode = false"
                >Text thuần</button>
                <button
                  class="bed-toggle-btn"
                  :class="{ active: isRichMode }"
                  @click="isRichMode = true"
                >Text Rich (Zalo)</button>
              </div>
              <div v-if="isRichMode" class="bed-wy-bar">
                <button class="bed-wy-btn" title="Đậm" @click="applyMarkdown('**')"><b>B</b></button>
                <button class="bed-wy-btn" title="Nghiêng" @click="applyMarkdown('_')"><i>I</i></button>
                <button class="bed-wy-btn" title="Mention" @click="insertText('@')">@</button>
              </div>
            </div>

            <div class="bed-editor-body">
              <textarea
                v-model="activeVariantText"
                class="bed-editor-content"
                placeholder="Em xin chào anh/chị {tên_khách}..."
                @input="markDirty"
                ref="editorRef"
              ></textarea>
              <div class="bed-editor-footer">
                <span class="bed-hint">💡 Dùng <code>{{ '{tên_khách}' }}</code>, <code>{{ '{tên_sale}' }}</code> để cá nhân hoá</span>
                <span class="bed-char-counter">{{ (activeVariantText || '').length }} / 1000 ký tự</span>
              </div>
            </div>
          </template>

          <!-- send_message: image / album / file / video editor -->
          <template v-else-if="draft.actionType === 'send_message' && activeComponent">
            <div class="bed-attach-editor">
              <h3 class="bed-attach-title">{{ componentLabel(activeComponent) }}</h3>
              <div v-if="activeComponent.kind === 'image' || activeComponent.kind === 'video' || activeComponent.kind === 'file'">
                <label class="bed-field-label">URL</label>
                <input
                  v-model="(activeComponent as any).url"
                  type="text"
                  class="bed-input"
                  placeholder="https://..."
                  @input="markDirty"
                />
                <label v-if="activeComponent.kind === 'file'" class="bed-field-label">Tên file</label>
                <input
                  v-if="activeComponent.kind === 'file'"
                  v-model="(activeComponent as any).filename"
                  type="text"
                  class="bed-input"
                  placeholder="bảng_giá_T6.pdf"
                  @input="markDirty"
                />
                <label class="bed-field-label">Caption (tuỳ chọn)</label>
                <input
                  v-model="(activeComponent as any).caption"
                  type="text"
                  class="bed-input"
                  @input="markDirty"
                />
              </div>
              <div v-else-if="activeComponent.kind === 'album'">
                <p class="bed-hint">Album tối đa 10 ảnh. Mỗi ảnh 1 URL.</p>
                <div v-for="(item, i) in ((activeComponent as any).items || []) as Array<{url: string}>" :key="i as number" class="bed-album-row">
                  <input
                    v-model="item.url"
                    type="text"
                    class="bed-input"
                    placeholder="https://..."
                    @input="markDirty"
                  />
                  <button class="bed-comp-x" @click="removeAlbumItem(i as number)">✕</button>
                </div>
                <button class="bed-add-btn" @click="addAlbumItem">+ Thêm ảnh</button>
              </div>
            </div>
          </template>

          <!-- request_friend editor -->
          <template v-else-if="draft.actionType === 'request_friend'">
            <div class="bed-toggle-row">
              <span class="bed-toggle-label">Lời chào kết bạn (biến thể {{ activeGreetingIdx + 1 }}/{{ greetingVariants.length }})</span>
            </div>
            <div class="bed-editor-body">
              <textarea
                v-model="greetingVariants[activeGreetingIdx]"
                class="bed-editor-content"
                placeholder="Chào anh/chị, em là Thành bên Sunshine..."
                @input="markDirty"
              ></textarea>
              <div class="bed-editor-footer">
                <span class="bed-char-counter">{{ (greetingVariants[activeGreetingIdx] || '').length }} / 500 ký tự (Zalo cap)</span>
              </div>
            </div>
          </template>

          <!-- update_status editor -->
          <template v-else-if="draft.actionType === 'update_status'">
            <div class="bed-editor-body" style="padding: 20px;">
              <label class="bed-field-label">Trạng thái mới</label>
              <select v-model="statusId" class="bed-input" @change="markDirty">
                <option value="">— Chọn trạng thái —</option>
                <option v-for="s in statusItems" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <p class="bed-hint" style="margin-top: 12px;">
                Khi Khối này chạy trong sequence/trigger, hệ thống sẽ đổi giai đoạn KH sang trạng thái đã chọn.
              </p>
            </div>
          </template>

          <div v-else class="bed-empty-editor">
            <div style="font-size: 36px; margin-bottom: 8px;">👈</div>
            <div>Chọn 1 thành phần bên trái để chỉnh sửa</div>
          </div>
        </section>

        <!-- Col 3: Zalo Preview LIVE -->
        <aside class="bed-col3">
          <div class="bed-col3-head">
            <span>📱 Xem trước trên Zalo</span>
            <span class="bed-live"><span class="bed-live-dot"></span> LIVE</span>
          </div>
          <div class="bed-zalo-window">
            <div class="bed-zalo-time-label">Hôm nay · {{ currentHHmm }}</div>
            <template v-if="draft.actionType === 'send_message'">
              <template v-for="(c, idx) in components" :key="idx">
                <div v-if="c.kind === 'text'" class="bed-zalo-bubble out">
                  {{ previewVariantText(c, idx) }}
                </div>
                <div v-else-if="c.kind === 'image'" class="bed-zalo-image"></div>
                <div v-else-if="c.kind === 'album'" class="bed-zalo-album">
                  <div v-for="(_item, i) in ((c as any).items || []).slice(0, 4)" :key="i" class="bed-zalo-album-item"></div>
                </div>
                <div v-else-if="c.kind === 'file'" class="bed-zalo-file">
                  📕 {{ (c as any).filename || 'file.pdf' }}
                </div>
                <div v-else-if="c.kind === 'video'" class="bed-zalo-video">🎬 Video</div>
                <div class="bed-zalo-time">{{ currentHHmm }} · Tin {{ idx + 1 }}/{{ components.length }}</div>
              </template>
              <div v-if="components.length === 0" class="bed-zalo-empty">
                Thêm thành phần bên trái để xem KH thấy gì
              </div>
            </template>

            <template v-else-if="draft.actionType === 'request_friend'">
              <div class="bed-zalo-bubble out">
                {{ greetingVariants[activeGreetingIdx] || 'Lời chào kết bạn...' }}
              </div>
              <div class="bed-zalo-time">{{ currentHHmm }} · Lời mời kết bạn</div>
            </template>

            <template v-else-if="draft.actionType === 'update_status'">
              <div class="bed-zalo-system">
                🏷 KH này sẽ tự đổi giai đoạn sang
                <b>{{ statusItems.find(s => s.id === statusId)?.name || '(chưa chọn)' }}</b>
              </div>
            </template>
          </div>
          <div class="bed-col3-foot">
            🎲 Variant random khi gửi:
            <b v-if="draft.actionType === 'send_message' && activeComponent?.kind === 'text'">
              {{ activeVariantIdx + 1 }}/{{ textVariantsForActive.length }}
            </b>
            <b v-else-if="draft.actionType === 'request_friend'">
              {{ activeGreetingIdx + 1 }}/{{ greetingVariants.length }}
            </b>
            <b v-else>—</b>
          </div>
        </aside>
      </div>

      <div v-if="error" class="bed-error">{{ error }}</div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { blocksApi } from '@/api/automation';
import { type Block, type BlockFolder, type BlockActionType } from '@/api/automation/types';

const props = defineProps<{
  modelValue: boolean;
  block: Block | null;
  folders: BlockFolder[];
  statusItems: Array<{ id: string; name: string }>;
}>();
const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  saved: [block: Block];
}>();

interface Draft {
  name: string;
  actionType: BlockActionType;
  folderId: string | null;
  tagIds: string[];
}
interface TextComponent {
  kind: 'text';
  defaultVariant: { text: string; styles?: unknown };
  variants?: Array<{ text: string; styles?: unknown }>;
}
interface ImageComponent { kind: 'image'; url: string; caption?: string }
interface AlbumComponent { kind: 'album'; items: Array<{ url: string; caption?: string }> }
interface FileComponent { kind: 'file'; url: string; filename: string; sizeBytes?: number; mimeType?: string }
interface VideoComponent { kind: 'video'; url: string; thumbnailUrl?: string; durationSec?: number; caption?: string }
type Component = TextComponent | ImageComponent | AlbumComponent | FileComponent | VideoComponent;

const draft = ref<Draft>({ name: '', actionType: 'send_message', folderId: null, tagIds: [] });
const components = ref<Component[]>([]);
const greetingVariants = ref<string[]>(['']);
const statusId = ref<string>('');

const activeComponentIdx = ref<number>(0);
const activeVariantIdx = ref<number>(0);
const activeGreetingIdx = ref<number>(0);
const isRichMode = ref<boolean>(false);
const addComponentMenu = ref<boolean>(false);

const saving = ref(false);
const lastSavedAt = ref<Date | null>(null);
const error = ref<string>('');
const isDirty = ref<boolean>(false);

const isEdit = computed(() => props.block !== null);

const activeComponent = computed<Component | null>(() => {
  if (draft.value.actionType !== 'send_message') return null;
  return components.value[activeComponentIdx.value] ?? null;
});

const textVariantsForActive = computed(() => {
  if (!activeComponent.value || activeComponent.value.kind !== 'text') return [];
  const c = activeComponent.value as TextComponent;
  return [c.defaultVariant, ...(c.variants || [])];
});
const activeVariantText = computed<string>({
  get: () => textVariantsForActive.value[activeVariantIdx.value]?.text ?? '',
  set: (v) => {
    if (!activeComponent.value || activeComponent.value.kind !== 'text') return;
    const c = activeComponent.value as TextComponent;
    if (activeVariantIdx.value === 0) c.defaultVariant.text = v;
    else {
      if (!c.variants) c.variants = [];
      const idx = activeVariantIdx.value - 1;
      if (!c.variants[idx]) c.variants[idx] = { text: '' };
      c.variants[idx].text = v;
    }
  },
});

const selectedFolderInfo = computed(() => props.folders.find((f) => f.id === draft.value.folderId));

const actionPillLabel = computed(() => {
  if (draft.value.actionType === 'send_message') return '📨 Gửi tin nhắn';
  if (draft.value.actionType === 'request_friend') return '🤝 Mời kết bạn';
  if (draft.value.actionType === 'update_status') return '🏷 Đổi trạng thái';
  return draft.value.actionType;
});

function componentIcon(k: string): string {
  if (k === 'text') return '📝';
  if (k === 'image') return '🖼️';
  if (k === 'album') return '🎞️';
  if (k === 'file') return '📎';
  if (k === 'video') return '🎬';
  return '?';
}
function componentLabel(c: Component): string {
  if (c.kind === 'text') return ((c as TextComponent).defaultVariant.text || '').slice(0, 28).trim() || 'Tin text';
  if (c.kind === 'image') return (c as ImageComponent).caption?.slice(0, 28) || 'Hình ảnh';
  if (c.kind === 'album') return `Album ${(c as AlbumComponent).items?.length || 0} hình`;
  if (c.kind === 'file') return (c as FileComponent).filename || 'File';
  if (c.kind === 'video') return (c as VideoComponent).caption?.slice(0, 28) || 'Video';
  return 'Thành phần';
}
function componentMeta(c: Component): string {
  if (c.kind === 'text') {
    const count = 1 + ((c as TextComponent).variants?.length || 0);
    return `${count} biến thể`;
  }
  if (c.kind === 'image') return 'URL ảnh';
  if (c.kind === 'album') return `${(c as AlbumComponent).items?.length || 0}/10 ảnh`;
  if (c.kind === 'file') return 'File đính kèm';
  if (c.kind === 'video') return 'Video URL';
  return '';
}

const currentHHmm = computed(() => {
  const d = new Date();
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
});
const lastSavedHint = computed(() => {
  if (!lastSavedAt.value) return '';
  const sec = Math.floor((Date.now() - lastSavedAt.value.getTime()) / 1000);
  if (sec < 60) return `${sec} giây trước`;
  return `${Math.floor(sec / 60)} phút trước`;
});

function previewVariantText(c: Component, _idx: number): string {
  if (c.kind !== 'text') return '';
  const tc = c as TextComponent;
  // Show variant 1 (default) trong preview — variants khác sẽ random khi gửi thật
  return tc.defaultVariant.text || '(chưa có nội dung)';
}

// ─── Component CRUD ──────────────────────────────────────────────────────
function addComponent(kind: Component['kind']) {
  addComponentMenu.value = false;
  let newC: Component;
  if (kind === 'text') newC = { kind: 'text', defaultVariant: { text: '' }, variants: [] };
  else if (kind === 'image') newC = { kind: 'image', url: '', caption: '' };
  else if (kind === 'album') newC = { kind: 'album', items: [{ url: '' }] };
  else if (kind === 'file') newC = { kind: 'file', url: '', filename: '' };
  else newC = { kind: 'video', url: '' };
  components.value.push(newC);
  activeComponentIdx.value = components.value.length - 1;
  activeVariantIdx.value = 0;
  markDirty();
}
function removeComponent(idx: number) {
  if (!confirm('Xoá thành phần này?')) return;
  components.value.splice(idx, 1);
  if (activeComponentIdx.value >= components.value.length) {
    activeComponentIdx.value = Math.max(0, components.value.length - 1);
  }
  markDirty();
}

function addTextVariant() {
  if (!activeComponent.value || activeComponent.value.kind !== 'text') return;
  const c = activeComponent.value as TextComponent;
  if (!c.variants) c.variants = [];
  c.variants.push({ text: '' });
  activeVariantIdx.value = (c.variants?.length || 0); // last
  markDirty();
}

function addGreeting() { greetingVariants.value.push(''); activeGreetingIdx.value = greetingVariants.value.length - 1; markDirty(); }
function removeGreeting(idx: number) {
  if (greetingVariants.value.length <= 1) return;
  greetingVariants.value.splice(idx, 1);
  activeGreetingIdx.value = Math.min(activeGreetingIdx.value, greetingVariants.value.length - 1);
  markDirty();
}

function addAlbumItem() {
  if (activeComponent.value?.kind !== 'album') return;
  const a = activeComponent.value as AlbumComponent;
  if (!a.items) a.items = [];
  if (a.items.length >= 10) { alert('Album tối đa 10 ảnh'); return; }
  a.items.push({ url: '' });
  markDirty();
}
function removeAlbumItem(i: number) {
  if (activeComponent.value?.kind !== 'album') return;
  const a = activeComponent.value as AlbumComponent;
  a.items?.splice(i, 1);
  markDirty();
}

// Tags
function addTag() {
  const input = prompt('Tag mới (vd #SunshineQ7):');
  if (!input?.trim()) return;
  const tag = input.trim().startsWith('#') ? input.trim() : `#${input.trim()}`;
  if (!draft.value.tagIds.includes(tag)) {
    draft.value.tagIds.push(tag);
    markDirty();
  }
}
function removeTag(tag: string) {
  draft.value.tagIds = draft.value.tagIds.filter((t) => t !== tag);
  markDirty();
}

// Markdown helpers
function applyMarkdown(token: string) {
  // Simple: append token to end of active variant (full WYSIWYG → tiptap defer)
  const v = activeVariantText.value;
  activeVariantText.value = `${v}${token}${token}`;
  markDirty();
}
function insertText(t: string) {
  activeVariantText.value = `${activeVariantText.value}${t}`;
  markDirty();
}

function markDirty() { isDirty.value = true; }

// Watch openness to reset state
watch(() => props.modelValue, (open) => {
  if (!open) return;
  error.value = '';
  isDirty.value = false;
  lastSavedAt.value = null;
  if (props.block) {
    draft.value = {
      name: props.block.name,
      actionType: props.block.actionType,
      folderId: props.block.folderId,
      tagIds: [...(props.block.tagIds || [])],
    };
    const c = props.block.content as any;
    // Components: ưu tiên shape mới {components[]}, fallback shape cũ {textVariants[], attachments[]}
    if (Array.isArray(c?.components)) {
      components.value = JSON.parse(JSON.stringify(c.components));
    } else if (Array.isArray(c?.textVariants) && c.textVariants.length > 0) {
      // Migrate legacy shape sang components[]
      components.value = [{
        kind: 'text',
        defaultVariant: { text: c.textVariants[0] },
        variants: c.textVariants.slice(1).map((t: string) => ({ text: t })),
      }];
      if (Array.isArray(c?.attachments)) {
        for (const a of c.attachments) {
          if (a.kind === 'image') components.value.push({ kind: 'image', url: a.url, caption: a.caption });
          else if (a.kind === 'video') components.value.push({ kind: 'video', url: a.url });
          else if (a.kind === 'file') components.value.push({ kind: 'file', url: a.url, filename: a.url.split('/').pop() || 'file' });
        }
      }
    } else {
      components.value = [];
    }
    greetingVariants.value = Array.isArray(c?.greetingVariants) ? [...c.greetingVariants] : [''];
    statusId.value = typeof c?.statusId === 'string' ? c.statusId : '';
    activeComponentIdx.value = 0;
    activeVariantIdx.value = 0;
    activeGreetingIdx.value = 0;
  } else {
    draft.value = { name: '', actionType: 'send_message', folderId: null, tagIds: [] };
    components.value = [{ kind: 'text', defaultVariant: { text: '' }, variants: [] }];
    greetingVariants.value = [''];
    statusId.value = '';
    activeComponentIdx.value = 0;
    activeVariantIdx.value = 0;
    activeGreetingIdx.value = 0;
  }
});

function buildContent(): Record<string, unknown> {
  if (draft.value.actionType === 'request_friend') {
    return { greetingVariants: greetingVariants.value.filter((s) => s.trim()) };
  }
  if (draft.value.actionType === 'send_message') {
    // Strip empty components
    const cleaned = components.value
      .map((c) => {
        if (c.kind === 'text') {
          const tc = c as TextComponent;
          const variants = (tc.variants || []).filter((v) => v.text.trim());
          if (!tc.defaultVariant.text.trim() && variants.length === 0) return null;
          return {
            kind: 'text',
            defaultVariant: { text: tc.defaultVariant.text, styles: tc.defaultVariant.styles },
            variants,
          };
        }
        if ((c as any).url || (c.kind === 'album' && (c as AlbumComponent).items?.length)) return c;
        return null;
      })
      .filter(Boolean);
    return { components: cleaned };
  }
  if (draft.value.actionType === 'update_status') {
    return { statusId: statusId.value };
  }
  return {};
}

async function onSave() {
  error.value = '';
  if (!draft.value.name.trim()) { error.value = 'Tên Khối không được để trống'; return; }
  saving.value = true;
  try {
    const content = buildContent();
    let block: Block;
    if (props.block) {
      block = await blocksApi.updateBlock(props.block.id, {
        name: draft.value.name.trim(),
        folderId: draft.value.folderId,
        content,
        tagIds: draft.value.tagIds,
      });
    } else {
      block = await blocksApi.createBlock({
        name: draft.value.name.trim(),
        actionType: draft.value.actionType,
        folderId: draft.value.folderId,
        content,
        tagIds: draft.value.tagIds,
      });
    }
    lastSavedAt.value = new Date();
    isDirty.value = false;
    emit('saved', block);
  } catch (err: any) {
    error.value = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Lỗi không xác định';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.bed-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Topbar */
.bed-topbar {
  background: #fff;
  border-bottom: 1px solid #e6e8eb;
  padding: 11px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.bed-back {
  color: #6b7280;
  cursor: pointer;
  font-size: 13px;
  background: transparent;
  border: 0;
  font-family: inherit;
  padding: 6px 10px;
  border-radius: 6px;
}
.bed-back:hover { background: #f4f5f7; color: #1f2328; }
.bed-name-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  color: #1f2328;
  outline: none;
  max-width: 480px;
  font-family: inherit;
}
.bed-name-input:hover { border-color: #e6e8eb; }
.bed-name-input:focus {
  border-color: #3b82f6;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.18);
}
.bed-save-status {
  font-size: 11px;
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 4px;
}
.bed-actions { display: flex; gap: 8px; margin-left: auto; }

.bed-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 7px;
  border: 1px solid #d4d7dc;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
}
.bed-btn-primary {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}
.bed-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.bed-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* Sub-bar */
.bed-subbar {
  padding: 9px 20px;
  border-bottom: 1px solid #e6e8eb;
  background: #fafbfc;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  flex-wrap: wrap;
}
.bed-sub-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bed-sub-label { color: #6b7280; font-weight: 600; }
.bed-sub-divider { width: 1px; background: #e6e8eb; height: 18px; }

.bed-folder-select, .bed-action-select {
  padding: 5px 9px;
  border: 1px solid #d4d7dc;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;
}
.bed-vis-hint {
  font-size: 11px;
  font-weight: 600;
  color: #10b981;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.bed-vis-hint.private { color: #f59e0b; }

.bed-tag-group { flex: 1; min-width: 0; }
.bed-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
  padding: 3px 9px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 500;
}
.bed-tag-x {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  padding: 0 2px;
  opacity: 0.6;
}
.bed-tag-x:hover { opacity: 1; }
.bed-tag-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px dashed #d4d7dc;
  padding: 3px 9px;
  border-radius: 11px;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
}
.bed-tag-add:hover { color: #1f2328; border-color: #9ca3af; }

.bed-action-pill {
  background: rgba(59,130,246,0.12);
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 8px;
}

/* Body 3 col */
.bed-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Col 1 */
.bed-col1 {
  width: 240px;
  background: #fafbfc;
  border-right: 1px solid #e6e8eb;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.bed-col1-head {
  padding: 12px 14px 8px;
  border-bottom: 1px solid #e6e8eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
}
.bed-col1-title {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.bed-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border-radius: 6px;
  background: #3b82f6;
  color: #fff;
  border: 0;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.bed-add-btn:hover { background: #1d4ed8; }
.bed-add-menu {
  position: absolute;
  top: calc(100% - 2px);
  right: 14px;
  background: #fff;
  border: 1px solid #d4d7dc;
  border-radius: 7px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  z-index: 10;
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 160px;
}
.bed-add-menu button {
  padding: 7px 12px;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.bed-add-menu button:hover { background: #f4f5f7; }

.bed-comp-list { padding: 8px; overflow-y: auto; flex: 1; }
.bed-comp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 7px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e6e8eb;
  margin-bottom: 6px;
  transition: all 0.12s;
}
.bed-comp-item:hover { border-color: #9ca3af; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.bed-comp-item.active {
  border-color: #3b82f6;
  background: rgba(59,130,246,0.08);
  box-shadow: 0 1px 4px rgba(59,130,246,0.18);
}
.bed-comp-drag { color: #9ca3af; font-size: 13px; cursor: grab; }
.bed-comp-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.bed-comp-info { flex: 1; min-width: 0; }
.bed-comp-name {
  font-size: 12px;
  font-weight: 600;
  color: #1f2328;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bed-comp-meta { font-size: 10.5px; color: #6b7280; margin-top: 1px; }
.bed-comp-item.active .bed-comp-meta { color: #1d4ed8; font-weight: 500; }
.bed-comp-x {
  background: transparent;
  border: 0;
  color: #9ca3af;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
}
.bed-comp-x:hover { color: #ef4444; }
.bed-comp-empty {
  text-align: center;
  font-size: 11.5px;
  color: #9ca3af;
  font-style: italic;
  padding: 20px 10px;
}

/* Col 2 */
.bed-col2 {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
}
.bed-variant-bar {
  padding: 12px 18px 0;
  border-bottom: 1px solid #e6e8eb;
  background: #fafbfc;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}
.bed-var-tab {
  padding: 8px 14px;
  border-radius: 7px 7px 0 0;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: 0;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  font-family: inherit;
}
.bed-var-tab:hover { background: #fff; color: #1f2328; }
.bed-var-tab.active {
  background: #fff;
  border-color: #e6e8eb;
  color: #1f2328;
  font-weight: 600;
  margin-bottom: -1px;
}
.bed-var-tab.active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: #3b82f6;
}
.bed-var-star { color: #f59e0b; font-size: 11px; }
.bed-var-default { opacity: 0.6; font-size: 10px; }
.bed-var-add { color: #3b82f6; font-weight: 500; }
.bed-ai-btn {
  margin-left: auto;
  margin-bottom: 6px;
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: #fff;
  border: 0;
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: not-allowed;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: inherit;
  opacity: 0.85;
}
.bed-ai-soon {
  background: rgba(255,255,255,0.25);
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 8px;
  font-weight: 600;
  margin-left: 2px;
}

.bed-toggle-row {
  padding: 10px 18px;
  border-bottom: 1px solid #e6e8eb;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
}
.bed-toggle-label { font-size: 11.5px; color: #6b7280; font-weight: 500; }
.bed-toggle {
  display: inline-flex;
  background: #f4f5f7;
  border-radius: 7px;
  padding: 2px;
  border: 1px solid #e6e8eb;
}
.bed-toggle-btn {
  padding: 5px 11px;
  border-radius: 5px;
  border: 0;
  background: transparent;
  font-size: 11.5px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
}
.bed-toggle-btn.active {
  background: #fff;
  color: #1f2328;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.bed-wy-bar {
  margin-left: auto;
  display: flex;
  gap: 2px;
  background: #f4f5f7;
  border-radius: 6px;
  padding: 3px;
  border: 1px solid #e6e8eb;
}
.bed-wy-btn {
  width: 26px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
  font-family: inherit;
}
.bed-wy-btn:hover { background: #fff; color: #1f2328; }

.bed-editor-body {
  flex: 1;
  padding: 18px 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.bed-editor-content {
  flex: 1;
  padding: 14px 18px;
  border: 1px solid #e6e8eb;
  border-radius: 9px;
  background: #fff;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2328;
  min-height: 200px;
  outline: none;
  font-family: inherit;
  resize: vertical;
  width: 100%;
}
.bed-editor-content:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.18);
}
.bed-editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  font-size: 11px;
  color: #9ca3af;
}
.bed-char-counter { font-variant-numeric: tabular-nums; }
.bed-hint { color: #6b7280; font-style: italic; }
.bed-hint code {
  background: #f4f5f7;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
}

.bed-attach-editor { padding: 20px; }
.bed-attach-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; }
.bed-field-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 10px 0 4px;
}
.bed-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d4d7dc;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.bed-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.18); }
.bed-album-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
.bed-album-row .bed-input { flex: 1; }

.bed-empty-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 13px;
  font-style: italic;
}

/* Col 3 Zalo preview */
.bed-col3 {
  width: 320px;
  background: linear-gradient(180deg, #e3f2fd 0%, #bbdefb 100%);
  border-left: 1px solid #e6e8eb;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.bed-col3-head {
  padding: 11px 14px;
  background: #0084ff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.bed-live { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; }
.bed-live-dot {
  width: 7px;
  height: 7px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
.bed-zalo-window {
  flex: 1;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  background: linear-gradient(180deg, #e3f2fd 0%, #bbdefb 100%);
}
.bed-zalo-time-label {
  align-self: center;
  font-size: 10px;
  color: #475569;
  background: rgba(255,255,255,0.6);
  padding: 3px 10px;
  border-radius: 10px;
  font-weight: 500;
}
.bed-zalo-bubble {
  max-width: 85%;
  padding: 9px 13px;
  border-radius: 14px;
  font-size: 12.5px;
  line-height: 1.45;
  word-wrap: break-word;
  white-space: pre-wrap;
}
.bed-zalo-bubble.out {
  background: #0084ff;
  color: #fff;
  align-self: flex-end;
  border-bottom-right-radius: 5px;
}
.bed-zalo-image {
  width: 160px;
  height: 100px;
  background: linear-gradient(135deg, #a7f3d0, #10b981);
  border-radius: 12px;
  align-self: flex-end;
}
.bed-zalo-album {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  width: 200px;
  border-radius: 12px;
  overflow: hidden;
  align-self: flex-end;
}
.bed-zalo-album-item {
  aspect-ratio: 1;
  background: linear-gradient(135deg, #fde68a, #f59e0b);
}
.bed-zalo-album-item:nth-child(2) { background: linear-gradient(135deg, #a7f3d0, #10b981); }
.bed-zalo-album-item:nth-child(3) { background: linear-gradient(135deg, #bfdbfe, #3b82f6); }
.bed-zalo-album-item:nth-child(4) { background: linear-gradient(135deg, #fbcfe8, #ec4899); }
.bed-zalo-file {
  align-self: flex-end;
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 12px;
  color: #1f2328;
  max-width: 240px;
  border-bottom-right-radius: 5px;
}
.bed-zalo-video {
  align-self: flex-end;
  background: #1f2328;
  color: #fff;
  border-radius: 12px;
  padding: 30px 50px;
  font-size: 13px;
  border-bottom-right-radius: 5px;
}
.bed-zalo-system {
  align-self: center;
  background: rgba(255,255,255,0.6);
  padding: 8px 14px;
  border-radius: 12px;
  font-size: 11.5px;
  color: #475569;
}
.bed-zalo-time {
  font-size: 9.5px;
  color: #475569;
  align-self: flex-end;
  padding: 0 6px;
  margin-top: -2px;
}
.bed-zalo-empty {
  align-self: center;
  font-size: 11.5px;
  color: #475569;
  font-style: italic;
  background: rgba(255,255,255,0.5);
  padding: 16px 20px;
  border-radius: 10px;
  text-align: center;
}
.bed-col3-foot {
  padding: 10px 12px;
  background: rgba(255,255,255,0.6);
  border-top: 1px solid rgba(0,0,0,0.06);
  font-size: 10.5px;
  color: #1e3a8a;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.bed-error {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 10px 18px;
  border-radius: 7px;
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  z-index: 100;
}
</style>
