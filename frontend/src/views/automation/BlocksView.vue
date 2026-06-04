<template>
  <div class="blocks-view">
    <header class="bv-topbar">
      <div class="bv-title">
        <span class="bv-icon-badge">🧱</span>
        <h1 class="bv-title-text">Khối nội dung</h1>
        <span class="bv-title-count">{{ allBlocks.length }} Khối</span>
      </div>
      <div class="bv-topbar-actions">
        <div class="bv-search">
          <span class="bv-search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            class="bv-search-input"
            placeholder="Tìm Khối theo tên, nội dung, tag..."
          />
        </div>
        <button class="bv-btn bv-btn-primary" @click="openCreate">+ Tạo Khối mới</button>
      </div>
    </header>

    <div class="bv-layout">
      <!-- Sidebar: Folder Public/Private (Anh chốt 2026-06-04) -->
      <aside class="bv-sidebar">
        <button
          class="bv-folder-item"
          :class="{ 'is-active': !selectedFolderId && !showArchived }"
          @click="onSelectAll"
        >
          <span class="bv-folder-ico">📋</span>
          <span class="bv-folder-label">Tất cả Khối</span>
          <span class="bv-folder-count">{{ activeBlocksCount }}</span>
        </button>

        <div v-if="publicFolders.length > 0" class="bv-sidebar-section">
          <div class="bv-sidebar-head">
            <span class="bv-vis-ico vis-public">🔓</span>
            <span>Công khai</span>
            <span class="bv-sidebar-hint">cả org dùng</span>
          </div>
          <button
            v-for="folder in publicFolders"
            :key="folder.id"
            class="bv-folder-item"
            :class="{ 'is-active': selectedFolderId === folder.id }"
            @click="onSelectFolder(folder.id)"
          >
            <span class="bv-folder-ico">📁</span>
            <span class="bv-folder-label">{{ folder.name }}</span>
            <span class="bv-folder-count">{{ folder._count?.blocks ?? 0 }}</span>
          </button>
        </div>

        <div v-if="privateFolders.length > 0" class="bv-sidebar-section">
          <div class="bv-sidebar-head">
            <span class="bv-vis-ico vis-private">🔒</span>
            <span>Riêng tư</span>
            <span class="bv-sidebar-hint">chỉ tôi</span>
          </div>
          <button
            v-for="folder in privateFolders"
            :key="folder.id"
            class="bv-folder-item"
            :class="{ 'is-active': selectedFolderId === folder.id }"
            @click="onSelectFolder(folder.id)"
          >
            <span class="bv-folder-ico">📁</span>
            <span class="bv-folder-label">{{ folder.name }}</span>
            <span class="bv-folder-count">{{ folder._count?.blocks ?? 0 }}</span>
          </button>
        </div>

        <div class="bv-folder-divider"></div>
        <button
          class="bv-folder-item bv-folder-archived"
          :class="{ 'is-active': showArchived }"
          @click="onSelectArchived"
        >
          <span class="bv-folder-ico">📦</span>
          <span class="bv-folder-label">Đã archive</span>
          <span class="bv-folder-count">{{ archivedCount }}</span>
        </button>
        <button class="bv-new-folder" @click="createFolderInline">+ Tạo thư mục mới</button>
      </aside>

      <!-- Main grid -->
      <main class="bv-main">
        <!-- Tag filter row + action type filter (Anh chốt 2026-06-04) -->
        <div class="bv-filter-row">
          <span class="bv-filter-label">🏷 Tag dự án/mục đích:</span>
          <button
            v-for="tag in availableTags"
            :key="tag"
            class="bv-chip"
            :class="{ 'is-active': selectedTags.includes(tag) }"
            @click="toggleTag(tag)"
          >
            {{ tag }}
            <span class="bv-chip-count">{{ tagCounts[tag] || 0 }}</span>
          </button>
          <button class="bv-chip bv-chip-dashed" @click="openTagPicker">+ Thêm tag</button>

          <div class="bv-filter-right">
            <span class="bv-filter-label">Loại:</span>
            <button
              v-for="type in actionTypeChips"
              :key="type.value"
              class="bv-chip"
              :class="{ 'is-active': actionTypeFilter === type.value }"
              @click="actionTypeFilter = actionTypeFilter === type.value ? 'all' : type.value"
            >
              {{ type.label }}
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="bv-empty">
          <v-progress-circular indeterminate size="32" color="primary" />
        </div>

        <!-- Empty state -->
        <div v-else-if="filteredBlocks.length === 0" class="bv-empty">
          <div class="bv-empty-icon">📭</div>
          <div class="bv-empty-title">
            {{ showArchived ? 'Không có Khối đã archive' : 'Chưa có Khối nào ở đây' }}
          </div>
          <p v-if="!showArchived" class="bv-empty-desc">
            Khối là 1 cụm tin nhắn (text + ảnh + file...) gửi cho khách hàng.
            Tạo 1 lần dùng nhiều nơi.
          </p>
          <button v-if="!showArchived" class="bv-btn bv-btn-primary" @click="openCreate">
            + Tạo Khối đầu tiên
          </button>
        </div>

        <!-- Grid card -->
        <div v-else class="bv-grid">
          <article
            v-for="block in filteredBlocks"
            :key="block.id"
            class="bv-card"
            :class="`kind-${block.actionType}`"
            @click="openEdit(block)"
          >
            <button class="bv-card-more" @click.stop="onCardMore(block, $event)">⋮</button>
            <div class="bv-card-head">
              <div class="bv-card-icon">{{ actionIcon(block.actionType) }}</div>
              <div class="bv-card-name-wrap">
                <div class="bv-card-name">{{ block.name }}</div>
                <div class="bv-card-kind">
                  <span v-if="block.folder?.visibility === 'private'" class="bv-vis-ico vis-private">🔒</span>
                  <span v-else class="bv-vis-ico vis-public">🔓</span>
                  {{ block.folder?.visibility === 'private' ? 'Riêng tư' : 'Công khai' }}
                  <span v-if="block.folder">· 📁 {{ block.folder.name }}</span>
                </div>
              </div>
            </div>

            <!-- Preview -->
            <div class="bv-card-preview">{{ previewText(block) }}</div>

            <div class="bv-card-foot">
              <span v-if="variantCount(block) > 0" class="bv-meta-chip variants">
                🎲 {{ variantCount(block) }} biến thể
              </span>
              <span v-if="block.usageCount > 0" class="bv-meta-chip usage">
                ⚡ {{ block.usageCount }} lượt
              </span>
              <span
                v-for="tag in block.tagIds?.slice(0, 3) || []"
                :key="tag"
                class="bv-tag-chip"
                :class="tagColorClass(tag)"
              >{{ tag }}</span>
              <span v-if="(block.tagIds?.length || 0) > 3" class="bv-meta-chip">+{{ block.tagIds.length - 3 }}</span>
            </div>
          </article>
        </div>
      </main>
    </div>

    <BlockEditorDialog
      v-model="editorOpen"
      :block="editingBlock"
      :folders="folders"
      :status-items="statusItems"
      @saved="onSaved"
    />

    <v-snackbar v-model="toastOpen" :color="toastColor" timeout="3000" location="bottom right">
      {{ toastMsg }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { blocksApi } from '@/api/automation';
import { SUPPORTED_ACTION_TYPES, type Block, type BlockFolder, type BlockActionType } from '@/api/automation/types';
import BlockEditorDialog from '@/components/automation/phase7/BlockEditorDialog.vue';
import { api } from '@/api';

const blocks = ref<Block[]>([]);
const folders = ref<BlockFolder[]>([]);
const statusItems = ref<Array<{ id: string; name: string }>>([]);
const loading = ref(true);

const selectedFolderId = ref<string | null>(null);
const showArchived = ref(false);
const actionTypeFilter = ref<BlockActionType | 'all'>('all');
const searchQuery = ref('');
const selectedTags = ref<string[]>([]);

const editorOpen = ref(false);
const editingBlock = ref<Block | null>(null);

const toastOpen = ref(false);
const toastMsg = ref('');
const toastColor = ref<'success' | 'error' | 'info'>('info');

// 2026-06-04: split folder theo visibility (Anh chốt)
const publicFolders = computed(() => folders.value.filter((f) => f.visibility === 'public'));
const privateFolders = computed(() => folders.value.filter((f) => f.visibility === 'private'));

const allBlocks = computed(() => blocks.value);
const activeBlocksCount = computed(() => blocks.value.filter((b) => !b.archivedAt).length);
const archivedCount = computed(() => blocks.value.filter((b) => b.archivedAt).length);

const ACTION_LABEL: Partial<Record<BlockActionType, string>> = {
  request_friend: '🤝 Mời KB',
  send_message: '📨 Gửi tin',
  update_status: '🏷 Đổi trạng thái',
};
const actionTypeChips = SUPPORTED_ACTION_TYPES.map((value) => ({
  value,
  label: ACTION_LABEL[value] ?? value,
}));
function actionIcon(t: BlockActionType): string {
  if (t === 'request_friend') return '🤝';
  if (t === 'update_status') return '🏷';
  return '📨';
}

// Tags discovered from all blocks
const availableTags = computed(() => {
  const set = new Set<string>();
  for (const b of blocks.value) {
    for (const t of b.tagIds || []) set.add(t);
  }
  return Array.from(set).sort();
});
const tagCounts = computed(() => {
  const map: Record<string, number> = {};
  for (const b of blocks.value) {
    if (b.archivedAt) continue;
    for (const t of b.tagIds || []) map[t] = (map[t] || 0) + 1;
  }
  return map;
});

function tagColorClass(tag: string): string {
  // Hash tag name → 1 of 5 color classes
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) % 5;
  return ['tag-sky', 'tag-purple', 'tag-teal', 'tag-pink', 'tag-amber'][hash];
}

const filteredBlocks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return blocks.value.filter((b) => {
    if (showArchived.value) { if (!b.archivedAt) return false; }
    else { if (b.archivedAt) return false; }
    if (selectedFolderId.value !== null && b.folderId !== selectedFolderId.value) return false;
    if (actionTypeFilter.value !== 'all' && b.actionType !== actionTypeFilter.value) return false;
    if (selectedTags.value.length > 0) {
      if (!b.tagIds?.some((t) => selectedTags.value.includes(t))) return false;
    }
    if (q) {
      const blob = `${b.name} ${JSON.stringify(b.content).slice(0, 500)} ${(b.tagIds || []).join(' ')}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
});

function previewText(block: Block): string {
  const c = block.content as any;
  if (Array.isArray(c?.greetingVariants) && c.greetingVariants.length > 0) {
    return String(c.greetingVariants[0]).slice(0, 160);
  }
  if (Array.isArray(c?.textVariants) && c.textVariants.length > 0) {
    return String(c.textVariants[0]).slice(0, 160);
  }
  if (Array.isArray(c?.components)) {
    const firstText = c.components.find((x: any) => x?.kind === 'text');
    if (firstText) {
      const txt = firstText?.defaultVariant?.text || firstText?.text || '';
      return String(txt).slice(0, 160);
    }
    const kinds = c.components.map((x: any) => x?.kind).filter(Boolean);
    return `Khối có ${c.components.length} thành phần: ${kinds.join(', ')}`;
  }
  return '(chưa có nội dung)';
}
function variantCount(block: Block): number {
  const c = block.content as any;
  if (Array.isArray(c?.greetingVariants)) return c.greetingVariants.length;
  if (Array.isArray(c?.textVariants)) return c.textVariants.length;
  if (Array.isArray(c?.components)) {
    let n = 0;
    for (const cmp of c.components) {
      if (cmp?.kind === 'text') {
        n += (Array.isArray(cmp.variants) ? cmp.variants.length : 0) + 1;
      }
    }
    return n;
  }
  return 0;
}

function onSelectAll() { selectedFolderId.value = null; showArchived.value = false; }
function onSelectFolder(id: string) { selectedFolderId.value = id; showArchived.value = false; }
function onSelectArchived() { showArchived.value = true; selectedFolderId.value = null; }

function toggleTag(tag: string) {
  const i = selectedTags.value.indexOf(tag);
  if (i >= 0) selectedTags.value.splice(i, 1);
  else selectedTags.value.push(tag);
}

async function openTagPicker() {
  const input = prompt('Gắn tag mới (vd #SunshineQ7):');
  if (input?.trim()) {
    const tag = input.trim().startsWith('#') ? input.trim() : `#${input.trim()}`;
    if (!selectedTags.value.includes(tag)) selectedTags.value.push(tag);
  }
}

async function loadAll() {
  loading.value = true;
  try {
    const [b, f, statusRes] = await Promise.all([
      blocksApi.listBlocks({ includeArchived: true, limit: 500 }),
      blocksApi.listFolders(),
      api.get<{ statuses: Array<{ id: string; name: string }> }>('/statuses').then((r) => r.data.statuses).catch(() => []),
    ]);
    blocks.value = b;
    folders.value = f;
    statusItems.value = Array.isArray(statusRes) ? statusRes : [];
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

function openCreate() { editingBlock.value = null; editorOpen.value = true; }
function openEdit(block: Block) { editingBlock.value = block; editorOpen.value = true; }

function showToast(msg: string, color: 'success' | 'error' | 'info' = 'info') {
  toastMsg.value = msg; toastColor.value = color; toastOpen.value = true;
}
function onSaved(_block: Block) { loadAll(); showToast('Đã lưu Khối', 'success'); }

async function onCardMore(block: Block, ev: MouseEvent) {
  ev.preventDefault();
  // Phase 1 simple action menu via confirm
  const action = prompt(`Khối "${block.name}":\n1 = Sửa\n2 = Nhân bản\n3 = ${block.archivedAt ? 'Khôi phục' : 'Archive'}\nNhập số:`);
  if (action === '1') openEdit(block);
  else if (action === '2') {
    await blocksApi.duplicateBlock(block.id);
    loadAll();
    showToast('Đã nhân bản', 'success');
  } else if (action === '3') {
    if (block.archivedAt) {
      await blocksApi.unarchiveBlock(block.id);
      showToast('Đã khôi phục', 'success');
    } else {
      if (!confirm(`Archive Khối "${block.name}"?`)) return;
      await blocksApi.archiveBlock(block.id);
      showToast('Đã archive', 'success');
    }
    loadAll();
  }
}

async function createFolderInline() {
  const name = prompt('Tên thư mục?');
  if (!name?.trim()) return;
  const visibility = confirm('Folder riêng tư (chỉ Anh thấy)?\nOK = Riêng tư, Hủy = Công khai (cả org dùng)') ? 'private' : 'public';
  await blocksApi.createFolder({ name: name.trim(), visibility });
  loadAll();
  showToast(`Đã tạo thư mục ${visibility === 'private' ? 'riêng tư' : 'công khai'}`, 'success');
}
</script>

<style scoped>
.blocks-view {
  max-width: 1366px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--smax-topnav-h, 52px) - 4px);
  background: var(--at-canvas-soft, #f4f5f7);
}

/* ─── Topbar ─── */
.bv-topbar {
  background: #fff;
  border-bottom: 1px solid var(--at-hairline, #e6e8eb);
  padding: 14px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.bv-title { display: flex; align-items: center; gap: 10px; }
.bv-icon-badge {
  width: 30px; height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #f59e0b, #ea580c);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px;
}
.bv-title-text {
  font-size: 18px; font-weight: 700; color: var(--at-ink, #1f2328);
  margin: 0;
}
.bv-title-count {
  font-size: 12px; font-weight: 500; color: var(--at-muted, #6b7280);
  margin-left: 6px;
}
.bv-topbar-actions { display: flex; gap: 10px; align-items: center; }

.bv-search { position: relative; width: 280px; }
.bv-search-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--at-muted, #9ca3af); font-size: 13px;
}
.bv-search-input {
  width: 100%;
  padding: 7px 11px 7px 32px;
  border: 1px solid var(--at-hairline, #d4d7dc);
  border-radius: 6px;
  font-size: 12.5px;
  outline: none;
  font-family: inherit;
}
.bv-search-input:focus {
  border-color: var(--at-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.18);
}

.bv-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 13px;
  border-radius: 7px;
  border: 1px solid var(--at-hairline, #d4d7dc);
  background: #fff;
  cursor: pointer;
  font-size: 12.5px; font-weight: 500;
  color: var(--at-ink, #1f2328);
  font-family: inherit;
  white-space: nowrap;
}
.bv-btn:hover { background: var(--at-canvas-soft, #f4f5f7); }
.bv-btn-primary {
  background: var(--at-primary, #3b82f6);
  border-color: var(--at-primary, #3b82f6);
  color: #fff;
}
.bv-btn-primary:hover {
  background: var(--at-primary-dark, #1d4ed8);
  border-color: var(--at-primary-dark, #1d4ed8);
}

/* ─── Layout ─── */
.bv-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ─── Sidebar ─── */
.bv-sidebar {
  width: 220px;
  background: #fff;
  border-right: 1px solid var(--at-hairline, #e6e8eb);
  padding: 14px 8px;
  overflow-y: auto;
  flex-shrink: 0;
}
.bv-sidebar-section { margin-top: 10px; }
.bv-sidebar-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 700;
  color: var(--at-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  padding: 6px 10px 4px;
}
.bv-sidebar-hint {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--at-muted, #9ca3af);
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}
.bv-vis-ico { font-size: 12px; }
.bv-vis-ico.vis-public { color: #10b981; }
.bv-vis-ico.vis-private { color: #f59e0b; }

.bv-folder-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--at-ink, #1f2328);
  background: transparent;
  border: 0;
  text-align: left;
  font-family: inherit;
  margin-bottom: 1px;
}
.bv-folder-item:hover { background: var(--at-canvas-soft, #f4f5f7); }
.bv-folder-item.is-active {
  background: rgba(59,130,246,0.12);
  color: #1d4ed8;
  font-weight: 600;
}
.bv-folder-ico { font-size: 13px; width: 16px; text-align: center; }
.bv-folder-label {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bv-folder-count {
  font-size: 11px;
  color: var(--at-muted, #6b7280);
  background: var(--at-canvas-soft, #f4f5f7);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}
.bv-folder-item.is-active .bv-folder-count {
  background: rgba(59,130,246,0.15);
  color: #1d4ed8;
}
.bv-folder-divider {
  border-top: 1px solid var(--at-hairline, #e6e8eb);
  margin: 10px 4px 8px;
}
.bv-folder-archived { color: var(--at-muted, #9ca3af); }
.bv-new-folder {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px;
  color: var(--at-primary, #3b82f6);
  font-size: 11.5px; font-weight: 500;
  cursor: pointer;
  border-radius: 6px;
  background: transparent;
  border: 0;
  font-family: inherit;
  width: 100%;
  text-align: left;
}
.bv-new-folder:hover { background: rgba(59,130,246,0.1); }

/* ─── Main ─── */
.bv-main {
  flex: 1;
  padding: 18px 22px;
  overflow-y: auto;
  min-width: 0;
}

/* ─── Filter row ─── */
.bv-filter-row {
  display: flex; align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.bv-filter-label {
  font-size: 11px; font-weight: 600;
  color: var(--at-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-right: 4px;
}
.bv-filter-right {
  margin-left: auto;
  display: flex; gap: 6px; align-items: center;
}

.bv-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: #fff;
  color: var(--at-muted, #6b7280);
  border: 1px solid var(--at-hairline, #e6e8eb);
  border-radius: 11px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}
.bv-chip:hover {
  background: var(--at-canvas-soft, #f4f5f7);
  color: var(--at-ink, #1f2328);
}
.bv-chip.is-active {
  background: rgba(59,130,246,0.12);
  color: #1d4ed8;
  border-color: #93c5fd;
  font-weight: 600;
}
.bv-chip-count {
  margin-left: 3px;
  font-size: 9px;
  opacity: 0.7;
}
.bv-chip-dashed { border-style: dashed; }

/* ─── Grid card ─── */
.bv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.bv-card {
  background: #fff;
  border: 1px solid var(--at-hairline, #e6e8eb);
  border-left: 4px solid var(--at-primary, #3b82f6);
  border-radius: 9px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.14s;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 170px;
}
.bv-card.kind-request_friend { border-left-color: #10b981; }
.bv-card.kind-update_status { border-left-color: #8b5cf6; }
.bv-card:hover {
  border-color: var(--at-primary, #3b82f6);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}
.bv-card-more {
  position: absolute; top: 10px; right: 10px;
  width: 26px; height: 26px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  color: var(--at-muted, #6b7280);
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.12s;
}
.bv-card-more:hover { background: var(--at-canvas-soft, #f4f5f7); color: var(--at-ink); }
.bv-card:hover .bv-card-more { opacity: 1; }

.bv-card-head { display: flex; align-items: flex-start; gap: 10px; }
.bv-card-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: rgba(59,130,246,0.12);
  color: #1d4ed8;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
.bv-card.kind-request_friend .bv-card-icon { background: rgba(16,185,129,0.12); color: #047857; }
.bv-card.kind-update_status .bv-card-icon { background: rgba(139,92,246,0.12); color: #6d28d9; }
.bv-card-name-wrap { flex: 1; min-width: 0; padding-right: 22px; }
.bv-card-name {
  font-size: 13.5px; font-weight: 600;
  color: var(--at-ink, #1f2328);
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.bv-card-kind {
  font-size: 11px; color: var(--at-muted, #6b7280);
  margin-top: 2px;
  display: flex; align-items: center; gap: 4px;
  flex-wrap: wrap;
}

.bv-card-preview {
  font-size: 12px;
  color: var(--at-muted, #6b7280);
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  background: var(--at-canvas-soft, #f4f5f7);
  padding: 8px 10px;
  border-radius: 6px;
  min-height: 42px;
}

.bv-card-foot {
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
}
.bv-meta-chip {
  font-size: 10.5px;
  color: var(--at-muted, #9ca3af);
  background: transparent;
  border: 1px solid var(--at-hairline, #e6e8eb);
  padding: 2px 7px;
  border-radius: 8px;
  font-weight: 500;
}
.bv-meta-chip.usage {
  background: var(--at-canvas-soft, #f4f5f7);
  color: var(--at-muted, #6b7280);
}
.bv-meta-chip.variants {
  background: #fef3c7;
  color: #92400e;
  border-color: #fcd34d;
}

.bv-tag-chip {
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 8px;
  font-weight: 500;
  border: 1px solid;
}
.bv-tag-chip.tag-sky { background: #e0f2fe; color: #0369a1; border-color: #7dd3fc; }
.bv-tag-chip.tag-purple { background: #ede9fe; color: #6d28d9; border-color: #c4b5fd; }
.bv-tag-chip.tag-teal { background: #cffafe; color: #0e7490; border-color: #67e8f9; }
.bv-tag-chip.tag-pink { background: #fce7f3; color: #9d174d; border-color: #f9a8d4; }
.bv-tag-chip.tag-amber { background: #fef3c7; color: #92400e; border-color: #fcd34d; }

/* ─── Empty ─── */
.bv-empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 60px 20px;
  text-align: center;
  background: #fff;
  border: 1px solid var(--at-hairline, #e6e8eb);
  border-radius: 9px;
  margin: 20px 0;
}
.bv-empty-icon { font-size: 36px; margin-bottom: 10px; }
.bv-empty-title {
  font-size: 15px; font-weight: 600;
  color: var(--at-ink, #1f2328);
  margin-bottom: 6px;
}
.bv-empty-desc {
  font-size: 12.5px; color: var(--at-muted, #6b7280);
  max-width: 420px; line-height: 1.5;
  margin-bottom: 14px;
}

@media (max-width: 1100px) {
  .bv-sidebar { width: 200px; }
}
</style>
