<template>
  <div class="tag-crm-bar" v-if="contactId">
    <div class="tag-pills">
      <span
        v-for="(tag, idx) in tags"
        :key="tag"
        class="tag-pill"
        :class="`hue-${idx % 8}`"
        :title="'Click × để xoá'"
      >
        {{ tag }}
        <button class="tag-x" title="Xoá tag" @click="removeTag(tag)">×</button>
      </span>

      <!-- Add input or "+ Thêm thẻ mới" button -->
      <span v-if="adding" class="tag-pill adding hue-add">
        <input
          ref="addInput"
          v-model="newTag"
          class="tag-input-inline"
          placeholder="Tên thẻ…"
          @keydown.enter.prevent="confirmAdd"
          @keydown.escape.prevent="cancelAdd"
          @blur="confirmAdd"
        />
      </span>
      <button v-else class="tag-add-btn" @click="startAdd">
        + Thêm thẻ mới
      </button>
    </div>

    <!-- Quick-add suggestions (chỉ khi chưa có tag nào) -->
    <div v-if="!tags.length && !adding" class="tag-suggestions">
      <span class="sug-label">Gợi ý:</span>
      <button
        v-for="s in SUGGESTIONS"
        :key="s.value"
        class="tag-sug"
        :class="s.color"
        @click="quickAdd(s.value)"
      >+ {{ s.label }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{
  contactId: string | null;
  modelValue: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [tags: string[]];
}>();

const toast = useToast();

const SUGGESTIONS = [
  { value: 'TTAVIO', label: 'TTAVIO', color: 'hue-0' },
  { value: 'EGV', label: 'EGV', color: 'hue-1' },
  { value: 'Phiền', label: 'Phiền', color: 'hue-2' },
  { value: 'Ấm', label: 'Ấm', color: 'hue-3' },
  { value: 'Nóng', label: 'Nóng', color: 'hue-4' },
  { value: 'Có tương tác', label: 'Có tương tác', color: 'hue-5' },
  { value: 'Lạnh', label: 'Lạnh', color: 'hue-6' },
  { value: 'Đàm Phán', label: 'Đàm Phán', color: 'hue-7' },
];

const tags = computed(() => props.modelValue || []);
const adding = ref(false);
const newTag = ref('');
const addInput = ref<HTMLInputElement | null>(null);

function startAdd() {
  adding.value = true;
  newTag.value = '';
  nextTick(() => addInput.value?.focus());
}

function cancelAdd() {
  adding.value = false;
  newTag.value = '';
}

async function confirmAdd() {
  const t = newTag.value.trim();
  if (!t) { cancelAdd(); return; }
  if (tags.value.includes(t)) {
    toast.warning('Tag đã tồn tại');
    cancelAdd();
    return;
  }
  await persist([...tags.value, t]);
  cancelAdd();
}

async function quickAdd(value: string) {
  if (tags.value.includes(value)) return;
  await persist([...tags.value, value]);
}

async function removeTag(tag: string) {
  await persist(tags.value.filter(t => t !== tag));
}

async function persist(next: string[]) {
  if (!props.contactId) return;
  emit('update:modelValue', next); // optimistic
  try {
    await api.patch(`/contacts/${props.contactId}`, { tags: next });
  } catch {
    toast.error('Lưu tag thất bại');
  }
}
</script>

<style scoped>
.tag-crm-bar {
  /* Extend full-width của input-area (input-area có padding 7px 13px) */
  margin: -7px -13px 7px;
  padding: 7px 13px 6px;
  background: var(--smax-bg);
  border-bottom: 1px solid var(--smax-grey-100);
}

.tag-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 5px 3px 9px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1.4px solid;
  background: transparent;
  white-space: nowrap;
  transition: filter 0.12s;
}
.tag-pill.adding { padding: 0 6px; }

/* 8 màu hue rotation (giống screenshot Smax) */
.hue-0 { color: #c62828; border-color: #ef9a9a; }   /* red — TTAVIO */
.hue-1 { color: #1565c0; border-color: #90caf9; }   /* blue — EGV */
.hue-2 { color: #d84315; border-color: #ffab91; }   /* deep orange — Phiền */
.hue-3 { color: #f9a825; border-color: #fff59d; }   /* yellow — Ấm */
.hue-4 { color: #ef6c00; border-color: #ffcc80; }   /* orange — Nóng */
.hue-5 { color: #2e7d32; border-color: #a5d6a7; }   /* green — Có tương tác */
.hue-6 { color: #00838f; border-color: #80deea; }   /* cyan — Lạnh */
.hue-7 { color: #6a1b9a; border-color: #ce93d8; }   /* purple — Đàm phán */
.hue-add { color: var(--smax-primary, #2962ff); border-color: var(--smax-primary); }

.tag-x {
  background: none;
  border: none;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  color: inherit;
  opacity: 0.55;
  transition: opacity 0.1s;
}
.tag-x:hover { opacity: 1; }

.tag-input-inline {
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--smax-primary);
  padding: 2px 0;
  min-width: 70px;
  font-family: inherit;
}

.tag-add-btn {
  background: var(--smax-grey-100);
  border: 1.4px dashed var(--smax-grey-300);
  color: var(--smax-grey-600);
  border-radius: 12px;
  font-size: 11.5px;
  font-weight: 500;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.tag-add-btn:hover {
  background: var(--smax-primary-soft, #e3f2fd);
  color: var(--smax-primary);
  border-color: var(--smax-primary);
}

.tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
  font-size: 11px;
}
.sug-label { color: var(--smax-grey-500); font-size: 10.5px; }
.tag-sug {
  background: transparent;
  border: 1px dashed currentColor;
  border-radius: 10px;
  font-size: 10.5px;
  font-weight: 500;
  padding: 2px 7px;
  cursor: pointer;
  opacity: 0.7;
}
.tag-sug:hover { opacity: 1; }
</style>
