<!--
  ForceNoteDialog — Phase Lead Pool 2026-05-24.
  Block dialog khi sale có LeadRequest cũ chưa note. Phải submit note hoặc trả lead về pool
  mới được xin lead mới.
-->
<template>
  <div class="fnd-overlay" @click.self="noop">
    <div class="fnd-modal" role="dialog">
      <header class="fnd-head">
        <div class="fnd-icon">📝</div>
        <div>
          <h2 class="fnd-title">Ghi note cho lead trước</h2>
          <p class="fnd-sub">
            Bạn cần ghi note hoặc trả lại lead "<strong>{{ pending.contactName || 'KH' }}</strong>" trước khi xin lead mới.
          </p>
        </div>
      </header>

      <div class="fnd-body">
        <label class="fnd-label">Bạn đã làm gì với KH này?</label>
        <textarea
          v-model="noteText"
          class="fnd-textarea"
          :placeholder="`Tối thiểu ${minLength} ký tự. Vd: Đã gọi điện, KH bận hẹn lại 16h chiều mai`"
          rows="4"
        ></textarea>
        <div class="fnd-counter" :class="{ ok: noteText.length >= minLength }">
          {{ noteText.length }} / {{ minLength }} ký tự
        </div>

        <div v-if="error" class="fnd-error">⚠ {{ error }}</div>
      </div>

      <footer class="fnd-footer">
        <button
          class="fnd-btn-danger"
          :disabled="loading"
          @click="onReturn"
          title="Trả lead này về pool — note sẽ không lưu"
        >
          ↩ Trả lại pool
        </button>
        <button
          class="fnd-btn-primary"
          :disabled="loading || noteText.length < minLength"
          @click="onSubmit"
        >
          <span v-if="loading">Đang lưu...</span>
          <span v-else>💾 Lưu note + Mở khoá xin lead mới</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useLeadPool, type PendingNoteLead } from '@/composables/use-lead-pool';

const props = defineProps<{ pending: PendingNoteLead; minLength: number }>();
const emit = defineEmits<{ (e: 'done'): void; (e: 'returned'): void }>();

const { submitNote, returnLead } = useLeadPool();
const noteText = ref('');
const loading = ref(false);
const error = ref('');

function noop() { /* block click outside */ }

async function onSubmit() {
  if (noteText.value.length < props.minLength) return;
  loading.value = true;
  error.value = '';
  const ok = await submitNote(props.pending.leadRequestId, noteText.value);
  loading.value = false;
  if (ok) emit('done');
  else error.value = 'Lưu note thất bại';
}

async function onReturn() {
  if (!confirm('Trả lead "' + (props.pending.contactName || 'KH') + '" về pool? Sale khác có thể nhận.')) return;
  loading.value = true;
  error.value = '';
  const ok = await returnLead(props.pending.leadRequestId);
  loading.value = false;
  if (ok) emit('returned');
  else error.value = 'Trả lead thất bại';
}
</script>

<style scoped>
.fnd-overlay {
  position: fixed; inset: 0; z-index: 1100;
  background: rgba(15, 23, 42, 0.65);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  backdrop-filter: blur(3px);
}

.fnd-modal {
  background: white;
  border-radius: 16px;
  max-width: 520px; width: 100%;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
  overflow: hidden;
}

.fnd-head {
  padding: 20px 24px;
  background: linear-gradient(135deg, #FFFBEB, #FEF3C7);
  border-bottom: 1px solid #FCD34D;
  display: flex; gap: 14px; align-items: flex-start;
}
.fnd-icon {
  width: 48px; height: 48px;
  background: white;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.fnd-title {
  margin: 0; font-size: 16px; font-weight: 700; color: #0F172A;
}
.fnd-sub {
  margin: 4px 0 0; font-size: 13px; color: #475569; line-height: 1.5;
}
.fnd-sub strong { color: #92400E; }

.fnd-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 10px; }
.fnd-label { font-size: 12.5px; font-weight: 600; color: #374151; }
.fnd-textarea {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid #E5E7EB;
  border-radius: 9px;
  font-size: 13.5px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}
.fnd-textarea:focus { border-color: #5E6AD2; }

.fnd-counter {
  font-size: 12px; color: #94A3B8; text-align: right;
  font-variant-numeric: tabular-nums;
}
.fnd-counter.ok { color: #047857; font-weight: 700; }

.fnd-error {
  background: #FEF2F2; color: #B91C1C;
  border: 1px solid #FCA5A5;
  padding: 8px 12px; border-radius: 7px;
  font-size: 12.5px;
}

.fnd-footer {
  padding: 14px 24px;
  background: #FAFBFC;
  border-top: 1px solid #E5E7EB;
  display: flex; justify-content: space-between; gap: 10px;
}

.fnd-btn-primary, .fnd-btn-danger {
  padding: 10px 18px; border-radius: 9px;
  font-weight: 700; font-size: 13px; cursor: pointer;
  font-family: inherit;
  border: none;
  transition: background 0.15s;
}
.fnd-btn-primary {
  background: #5E6AD2; color: white;
}
.fnd-btn-primary:hover:not(:disabled) { background: #4F46E5; }
.fnd-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.fnd-btn-danger {
  background: white; color: #B91C1C;
  border: 1px solid #FCA5A5;
}
.fnd-btn-danger:hover:not(:disabled) { background: #FEF2F2; }
.fnd-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
