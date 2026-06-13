<template>
  <div class="mpd-overlay" @click.self="$emit('close')">
    <div class="mpd-card">
      <header class="mpd-head">
        <b>Chọn từ Kho phương tiện</b>
        <input v-model="search" class="mpd-search" placeholder="🔍 Tìm…" @input="debouncedReload" />
        <button class="mpd-x" @click="$emit('close')">✕</button>
      </header>
      <div class="mpd-body">
        <div v-if="loading" class="mpd-empty">Đang tải…</div>
        <div v-else-if="items.length === 0" class="mpd-empty">
          Kho trống. Vào trang <b>Kho ảnh</b> để tải lên trước.
        </div>
        <div v-else class="mpd-grid">
          <button
            v-for="a in items" :key="a.id"
            class="mpd-cell" :class="{ on: picked.has(a.id) }"
            @click="toggle(a)"
          >
            <img v-if="a.thumbnailUrl" :src="a.thumbnailUrl" loading="lazy" alt="" />
            <span v-else class="ph">{{ a.kind === 'video' ? '🎬' : a.kind === 'file' ? '📄' : '🖼' }}</span>
            <span class="mpd-name">{{ a.name }}</span>
            <span v-if="picked.has(a.id)" class="mpd-check">✓</span>
          </button>
        </div>
      </div>
      <footer class="mpd-foot">
        <span class="mpd-count">{{ multiple ? `Đã chọn ${picked.size} ảnh` : 'Chọn 1 ảnh' }}</span>
        <button class="mpd-confirm" :disabled="picked.size === 0" @click="confirm">Chèn</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listMedia, type MediaAssetItem } from '@/api/media';

// publicOnly: CHỈ hiện media CÔNG KHAI (visibility='public'). Dùng khi gắn media vào
// Block/automation — tránh ảnh nick Riêng tư lọt ra broadcast (privacy, anh chốt 2026-06-12).
// Default false → các chỗ dùng khác (vd chèn vào chat) không bị lọc, hành vi cũ giữ nguyên.
const props = defineProps<{ multiple?: boolean; kind?: string; publicOnly?: boolean }>();
const emit = defineEmits<{ close: []; pick: [assets: MediaAssetItem[]] }>();

const items = ref<MediaAssetItem[]>([]);
const loading = ref(false);
const search = ref('');
const picked = ref<Set<string>>(new Set());
const pickedAssets = ref<Map<string, MediaAssetItem>>(new Map());

let timer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload() { if (timer) clearTimeout(timer); timer = setTimeout(reload, 300); }

async function reload() {
  loading.value = true;
  try {
    items.value = await listMedia({
      kind: props.kind || 'image',
      q: search.value || undefined,
      limit: 40,
      ...(props.publicOnly ? { visibility: 'public' } : {}),
    });
  } catch { /* ignore */ } finally { loading.value = false; }
}

function toggle(a: MediaAssetItem) {
  if (!props.multiple) {
    // single: chọn 1, confirm ngay
    emit('pick', [a]);
    emit('close');
    return;
  }
  if (picked.value.has(a.id)) { picked.value.delete(a.id); pickedAssets.value.delete(a.id); }
  else { picked.value.add(a.id); pickedAssets.value.set(a.id, a); }
  picked.value = new Set(picked.value);
}

function confirm() {
  emit('pick', Array.from(pickedAssets.value.values()));
  emit('close');
}

onMounted(reload);
</script>

<style scoped>
.mpd-overlay { position:fixed; inset:0; z-index:3000; background:rgba(24,29,38,.45); display:flex; align-items:center; justify-content:center; }
.mpd-card { --ink:#181d26; --muted:#41454d; --hairline:#dddddd; --canvas:#fff; --soft:#f8fafc; --coral:#aa2d00;
  background:var(--canvas); border-radius:12px; width:680px; max-width:92vw; max-height:80vh; display:flex; flex-direction:column; overflow:hidden; }
.mpd-head { display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--hairline); }
.mpd-head b { color:var(--ink); }
.mpd-search { margin-left:auto; border:1px solid var(--hairline); border-radius:6px; padding:5px 10px; font-size:13px; width:160px; outline:none; }
.mpd-x { border:none; background:none; cursor:pointer; color:var(--muted); font-size:15px; }
.mpd-body { padding:16px 18px; overflow:auto; flex:1; }
.mpd-empty { padding:40px; text-align:center; color:var(--muted); }
.mpd-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:10px; }
.mpd-cell { border:1px solid var(--hairline); border-radius:8px; overflow:hidden; cursor:pointer; background:var(--canvas); padding:0; position:relative; }
.mpd-cell.on { border-color:var(--ink); box-shadow:0 0 0 2px var(--ink); }
.mpd-cell img { width:100%; height:80px; object-fit:cover; display:block; }
.mpd-cell .ph { display:flex; align-items:center; justify-content:center; height:80px; font-size:26px; background:linear-gradient(135deg,#cfd6dd,#aeb6bf); }
.mpd-name { display:block; font-size:11px; padding:4px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--ink); }
.mpd-check { position:absolute; top:5px; right:5px; background:var(--ink); color:#fff; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; }
.mpd-foot { padding:12px 18px; border-top:1px solid var(--hairline); display:flex; align-items:center; justify-content:space-between; }
.mpd-count { font-size:13px; color:var(--muted); }
.mpd-confirm { background:var(--ink); color:#fff; border:none; border-radius:8px; padding:8px 20px; font-size:13.5px; font-weight:500; cursor:pointer; }
.mpd-confirm:disabled { opacity:.5; cursor:default; }
</style>
