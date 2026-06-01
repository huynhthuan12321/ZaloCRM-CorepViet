<template>
  <div class="fb-page">
    <header class="fb-head">
      <div class="fb-head-left">
        <div class="fb-icon">f</div>
        <div>
          <h1 class="fb-title">Facebook Lead Ads</h1>
          <p class="fb-sub">Đồng bộ lead form Facebook về Tệp khách hàng theo <code>#KEY</code> trong tên Campaign</p>
        </div>
      </div>
      <button class="fb-btn-primary" :disabled="loading" @click="openConnect">
        + Kết nối Page
      </button>
    </header>

    <!-- Stats 24h -->
    <section v-if="status" class="fb-stats">
      <div class="fb-stat-card">
        <div class="fb-stat-label">Lead nhận 24h</div>
        <div class="fb-stat-val">{{ status.stats24h.received }}</div>
      </div>
      <div class="fb-stat-card ok">
        <div class="fb-stat-label">Đã route</div>
        <div class="fb-stat-val">{{ status.stats24h.processed }}</div>
      </div>
      <div class="fb-stat-card warn">
        <div class="fb-stat-label">Unrouted</div>
        <div class="fb-stat-val">{{ status.stats24h.unrouted }}</div>
      </div>
      <div class="fb-stat-card err">
        <div class="fb-stat-label">Fail</div>
        <div class="fb-stat-val">{{ status.stats24h.failed }}</div>
      </div>
    </section>

    <!-- Webhook URL -->
    <section v-if="status" class="fb-card">
      <div class="fb-card-title">📌 Webhook URL (paste vào Meta App config)</div>
      <div class="fb-row">
        <code class="fb-mono">{{ status.webhookUrl }}</code>
        <button class="fb-btn-ghost" @click="copy(status.webhookUrl)">Copy</button>
      </div>
    </section>

    <!-- Pages connected -->
    <section class="fb-card">
      <div class="fb-card-title">📄 Pages đã kết nối ({{ status?.pages?.length ?? 0 }})</div>
      <div v-if="!status?.pages?.length" class="fb-empty">
        Chưa kết nối Page nào. Click "Kết nối Page" để bắt đầu.
      </div>
      <div v-else class="fb-pages-list">
        <div v-for="p in status.pages" :key="p.id" class="fb-page-row">
          <div class="fb-page-info">
            <div class="fb-page-name">{{ p.pageName || `Page ID: ${p.pageId}` }}</div>
            <div class="fb-page-meta">
              ID: <code>{{ p.pageId }}</code> ·
              <span :class="['fb-pill', p.isActive ? 'ok' : 'off']">
                {{ p.isActive ? '● Active' : '○ Disabled' }}
              </span>
              <span v-if="p.lastWebhookAt"> · Last lead: {{ relativeTime(p.lastWebhookAt) }}</span>
            </div>
          </div>
          <div class="fb-page-actions">
            <button class="fb-btn-ghost" :disabled="loadingToken[p.id]" @click="showVerifyToken(p.id)">
              {{ revealedToken[p.id] ? '👁 Ẩn' : '🔑 Verify token' }}
            </button>
            <button class="fb-btn-danger" @click="disconnect(p.id, p.pageName || p.pageId)">Ngắt kết nối</button>
          </div>
          <div v-if="revealedToken[p.id]" class="fb-verify-token">
            <code>{{ revealedToken[p.id] }}</code>
            <button class="fb-btn-ghost mini" @click="copy(revealedToken[p.id])">Copy</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Customer Lists with integrationKey edit inline -->
    <section class="fb-card">
      <div class="fb-card-title">
        🗂 Tệp khách hàng — Gán Mã đồng bộ FB
        <span class="fb-card-hint">Marketer gán key này vào cuối tên Campaign trên FB (vd <code>#A-001</code>)</span>
      </div>
      <div v-if="listsLoading" class="fb-empty">Đang tải...</div>
      <div v-else-if="!lists.length" class="fb-empty">Chưa có tệp khách hàng nào. Vào "Tệp khách hàng" tạo mới trước.</div>
      <table v-else class="fb-table">
        <thead>
          <tr>
            <th>Tệp</th>
            <th style="width:160px">Mã đồng bộ (#)</th>
            <th style="width:80px">KH</th>
            <th style="width:100px">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in nonUnroutedLists" :key="l.id">
            <td>
              <span class="list-emoji">{{ l.iconEmoji || '📂' }}</span>
              <span class="list-name">{{ l.name }}</span>
            </td>
            <td>
              <div class="fb-key-edit">
                <span class="fb-key-prefix">#</span>
                <input
                  :value="keyDrafts[l.id] ?? l.integrationKey ?? ''"
                  :placeholder="l.integrationKey ?? 'A-001'"
                  maxlength="32"
                  @input="(e) => onKeyInput(l.id, (e.target as HTMLInputElement).value)"
                  @blur="saveKey(l)"
                  @keydown.enter="saveKey(l)"
                />
                <span v-if="keyStatus[l.id]" :class="['fb-key-status', keyStatus[l.id]]">
                  {{ keyStatus[l.id] === 'saved' ? '✓' : keyStatus[l.id] === 'saving' ? '⏳' : '✗' }}
                </span>
              </div>
            </td>
            <td>{{ l.totalEntries }}</td>
            <td>
              <span :class="['fb-pill', l.archivedAt ? 'off' : (l.integrationKey ? 'ok' : 'warn')]">
                {{ l.archivedAt ? 'Lưu trữ' : (l.integrationKey ? '✓ Sẵn sàng' : '⚠ Chưa gán') }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="unroutedListInfo" class="fb-unrouted-info">
        <div class="fb-pill warn">🚨 Unrouted bucket</div>
        <span><strong>{{ unroutedListInfo.totalEntries }}</strong> lead chưa route đúng.</span>
        <router-link :to="`/automation/bot/lists/${unroutedListInfo.id}`" class="fb-link">Xem →</router-link>
      </div>
    </section>

    <!-- Help -->
    <section class="fb-help">
      <details>
        <summary>💡 Cách setup Facebook App + Webhook (mở rộng)</summary>
        <ol>
          <li>Truy cập <a href="https://developers.facebook.com/apps" target="_blank">developers.facebook.com/apps</a> → Create App → Business</li>
          <li>App name: "Hung Son CRM Lead Sync" (hoặc tên bất kỳ)</li>
          <li>Get <strong>App ID</strong> + <strong>App Secret</strong> → đưa cho dev paste vào file <code>.env</code> backend (<code>FB_APP_SECRET</code>)</li>
          <li>Add Product: <strong>Webhooks</strong> + <strong>Marketing API</strong></li>
          <li>Trong Webhooks → Page → "Edit Subscriptions"
            <ul>
              <li>Callback URL: <code>{{ status?.webhookUrl }}</code></li>
              <li>Verify Token: copy từ button "🔑 Verify token" ở Page tương ứng</li>
              <li>Subscribe field: <code>leadgen</code></li>
            </ul>
          </li>
          <li>App Review: request permission <code>leads_retrieval</code> + <code>pages_show_list</code> + <code>pages_manage_metadata</code></li>
          <li>Get Page Access Token: <a href="https://developers.facebook.com/tools/explorer/" target="_blank">Graph API Explorer</a> → Get User Token → Select Page → Long-lived token</li>
          <li>Paste Page Access Token vào form "Kết nối Page" trên CRM</li>
          <li>Test: tạo Campaign FB tên có <code>#KEY</code> match với tệp khách hàng → submit form test → lead về CRM trong &lt;30s</li>
        </ol>
      </details>

      <details>
        <summary>🎯 Cách dùng #KEY trong tên Campaign</summary>
        <p>Trong CRM → Tệp khách hàng → Edit → gán <strong>Mã đồng bộ FB</strong> (vd <code>A-001</code>).</p>
        <p>Trên FB Ads Manager, đặt tên campaign có <code>#A-001</code> ở bất kỳ vị trí nào (em parse <strong>#KEY cuối cùng</strong>, case-insensitive):</p>
        <ul>
          <li><code>Sunshine Q7 - Tháng 5/2026 #A-001</code></li>
          <li><code>#A-001 | Marina Bay | Re-target</code></li>
          <li><code>Sunshine #cũ #A-001 #v2</code> → lấy <code>#v2</code> (cuối cùng!)</li>
        </ul>
        <p>Form / Ad Set / Ad đặt tên gì cũng được. Sao chép campaign giữ nguyên <code>#KEY</code> → routing tự động.</p>
      </details>
    </section>

    <!-- Connect modal -->
    <Teleport to="body">
      <div v-if="connectOpen" class="fb-modal-bg" @click.self="connectOpen = false">
        <div class="fb-modal">
          <header class="fb-modal-head">
            <span>+ Kết nối Facebook Page</span>
            <button @click="connectOpen = false">×</button>
          </header>
          <div class="fb-modal-body">
            <div class="fb-form-row">
              <label>Page ID <span class="req">*</span></label>
              <input v-model.trim="form.pageId" placeholder="vd: 102938475123456" />
              <div class="fb-form-hint">ID Page Facebook (vào Page → About → Page ID)</div>
            </div>
            <div class="fb-form-row">
              <label>Page Name</label>
              <input v-model.trim="form.pageName" placeholder="vd: HS Holding" />
              <div class="fb-form-hint">Tên hiển thị (optional, để dễ nhớ)</div>
            </div>
            <div class="fb-form-row">
              <label>Page Access Token <span class="req">*</span></label>
              <textarea v-model.trim="form.pageAccessToken" rows="4" placeholder="EAAB..." />
              <div class="fb-form-hint">Long-lived Page access token từ Graph API Explorer</div>
            </div>
            <div v-if="form.error" class="fb-form-err">{{ form.error }}</div>
          </div>
          <footer class="fb-modal-foot">
            <button class="fb-btn-ghost" @click="connectOpen = false">Hủy</button>
            <button class="fb-btn-primary" :disabled="connectLoading" @click="doConnect">
              {{ connectLoading ? 'Đang xác thực...' : 'Kết nối' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { formatInOrgTz } from '@/composables/use-org-timezone';

interface PageRow {
  id: string;
  pageId: string;
  pageName: string | null;
  isActive: boolean;
  subscribedAt: string;
  lastWebhookAt: string | null;
}

interface StatusResponse {
  pages: PageRow[];
  stats24h: { received: number; processed: number; failed: number; unrouted: number };
  webhookUrl: string;
}

const toast = useToast();
const status = ref<StatusResponse | null>(null);
const loading = ref(false);
const loadingToken = reactive<Record<string, boolean>>({});
const revealedToken = reactive<Record<string, string>>({});

interface ListRow {
  id: string;
  name: string;
  iconEmoji: string | null;
  totalEntries: number;
  archivedAt: string | null;
  integrationKey: string | null;
  displayInlineFields: string[];
}
const lists = ref<ListRow[]>([]);
const listsLoading = ref(false);
const keyDrafts = reactive<Record<string, string>>({});
const keyStatus = reactive<Record<string, 'saving' | 'saved' | 'error'>>({});

import { computed } from 'vue';
const nonUnroutedLists = computed(() => lists.value.filter((l) => l.integrationKey !== '__UNROUTED__'));
const unroutedListInfo = computed(() => lists.value.find((l) => l.integrationKey === '__UNROUTED__'));

const connectOpen = ref(false);
const connectLoading = ref(false);
const form = reactive<{ pageId: string; pageName: string; pageAccessToken: string; error: string }>({
  pageId: '',
  pageName: '',
  pageAccessToken: '',
  error: '',
});

async function fetchStatus() {
  loading.value = true;
  try {
    const { data } = await api.get<StatusResponse>('/integrations/facebook/status');
    status.value = data;
  } catch (e: unknown) {
    toast.error('Không tải được trạng thái FB integration');
  } finally {
    loading.value = false;
  }
}

function openConnect() {
  form.pageId = '';
  form.pageName = '';
  form.pageAccessToken = '';
  form.error = '';
  connectOpen.value = true;
}

async function doConnect() {
  if (!form.pageId.trim() || !form.pageAccessToken.trim()) {
    form.error = 'Page ID và Access Token bắt buộc';
    return;
  }
  connectLoading.value = true;
  form.error = '';
  try {
    await api.post('/integrations/facebook/connect', {
      pageId: form.pageId,
      pageName: form.pageName || undefined,
      pageAccessToken: form.pageAccessToken,
    });
    toast.success(`Đã kết nối Page ${form.pageId}`);
    connectOpen.value = false;
    await fetchStatus();
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } };
    form.error = err.response?.data?.error || 'Kết nối thất bại';
  } finally {
    connectLoading.value = false;
  }
}

async function disconnect(id: string, label: string) {
  if (!confirm(`Ngắt kết nối Page "${label}"? Lead mới từ Page này sẽ KHÔNG vào CRM nữa.`)) return;
  try {
    await api.delete(`/integrations/facebook/${id}`);
    toast.success('Đã ngắt kết nối');
    await fetchStatus();
  } catch {
    toast.error('Ngắt kết nối thất bại');
  }
}

async function showVerifyToken(id: string) {
  if (revealedToken[id]) {
    delete revealedToken[id];
    return;
  }
  loadingToken[id] = true;
  try {
    const { data } = await api.get<{ webhookVerifyToken: string }>(`/integrations/facebook/${id}/verify-token`);
    revealedToken[id] = data.webhookVerifyToken;
  } catch {
    toast.error('Không lấy được verify token');
  } finally {
    loadingToken[id] = false;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Đã copy');
  } catch {
    toast.error('Không copy được');
  }
}

async function fetchLists() {
  listsLoading.value = true;
  try {
    const { data } = await api.get<{ lists: ListRow[] }>('/customer-lists', { params: { limit: 200, status: 'active' } });
    lists.value = data.lists ?? [];
  } catch {
    toast.error('Không tải được tệp khách hàng');
  } finally {
    listsLoading.value = false;
  }
}

function onKeyInput(id: string, val: string) {
  keyDrafts[id] = val.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  delete keyStatus[id];
}

async function saveKey(list: ListRow) {
  const draft = keyDrafts[list.id];
  if (draft === undefined) return; // không sửa
  const newKey = draft.trim() || null;
  if (newKey === list.integrationKey) return; // no change

  keyStatus[list.id] = 'saving';
  try {
    await api.patch(`/customer-lists/${list.id}`, { integrationKey: newKey });
    list.integrationKey = newKey;
    keyStatus[list.id] = 'saved';
    setTimeout(() => { delete keyStatus[list.id]; }, 2000);
    delete keyDrafts[list.id];
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; detail?: string } } };
    keyStatus[list.id] = 'error';
    toast.error(err.response?.data?.detail || err.response?.data?.error || 'Lưu key thất bại');
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m}p trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h trước`;
  return formatInOrgTz(iso);
}

onMounted(() => {
  void fetchStatus();
  void fetchLists();
});
</script>

<style scoped>
.fb-page {
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
  font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
  color: #1f2937;
}
.fb-head {
  display: flex; align-items: center; gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e5e7eb;
}
.fb-head-left { display: flex; gap: 12px; align-items: center; flex: 1; }
.fb-icon {
  width: 48px; height: 48px; background: #1877F2; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: 700; font-size: 24px;
}
.fb-title { font-size: 22px; margin: 0; font-weight: 700; }
.fb-sub { font-size: 13px; color: #6b7280; margin: 2px 0 0; }
.fb-sub code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: monospace; color: #0f172a; }

.fb-btn-primary {
  background: #1877F2; color: white; border: none; border-radius: 8px;
  padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.fb-btn-primary:hover:not(:disabled) { background: #166fe5; }
.fb-btn-primary:disabled { opacity: 0.5; cursor: wait; }
.fb-btn-ghost {
  background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 7px;
  padding: 6px 12px; font-size: 12px; cursor: pointer;
}
.fb-btn-ghost.mini { padding: 3px 8px; font-size: 11px; }
.fb-btn-ghost:hover { background: #f3f4f6; }
.fb-btn-danger {
  background: white; color: #dc2626; border: 1px solid #fca5a5; border-radius: 7px;
  padding: 6px 12px; font-size: 12px; cursor: pointer;
}
.fb-btn-danger:hover { background: #fef2f2; }

.fb-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
.fb-stat-card {
  background: white; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 14px 16px;
}
.fb-stat-card.ok { border-color: #86efac; background: #f0fdf4; }
.fb-stat-card.warn { border-color: #fde68a; background: #fffbeb; }
.fb-stat-card.err { border-color: #fca5a5; background: #fef2f2; }
.fb-stat-label { font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.4px; }
.fb-stat-val { font-size: 26px; font-weight: 700; margin-top: 4px; color: #0f172a; }

.fb-card {
  background: white; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 16px 18px; margin-bottom: 16px;
}
.fb-card-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #0f172a; }
.fb-row { display: flex; align-items: center; gap: 10px; }
.fb-mono { font-family: monospace; background: #f1f5f9; padding: 6px 10px; border-radius: 5px; font-size: 12px; flex: 1; color: #0f172a; }
.fb-empty { color: #9ca3af; font-size: 13px; padding: 12px 0; font-style: italic; }

.fb-pages-list { display: flex; flex-direction: column; gap: 10px; }
.fb-page-row {
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.fb-page-info { display: flex; flex-direction: column; gap: 3px; }
.fb-page-name { font-weight: 700; font-size: 14px; }
.fb-page-meta { font-size: 11.5px; color: #6b7280; }
.fb-page-meta code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: monospace; color: #0f172a; }
.fb-page-actions { display: flex; gap: 8px; align-items: center; align-self: flex-start; }
.fb-pill { padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 600; }
.fb-pill.ok { background: #dcfce7; color: #166534; }
.fb-pill.off { background: #f3f4f6; color: #6b7280; }
.fb-verify-token { display: flex; gap: 8px; align-items: center; padding: 6px 8px; background: #fef9c3; border-radius: 6px; }
.fb-verify-token code { font-family: monospace; font-size: 11.5px; flex: 1; word-break: break-all; }

.fb-card-hint { font-size: 11px; color: #6b7280; font-weight: 400; margin-left: 8px; }
.fb-card-hint code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-family: monospace; }
.fb-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fb-table th, .fb-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #f3f4f6; }
.fb-table th { background: #fafafa; font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600; }
.list-emoji { font-size: 16px; margin-right: 6px; }
.list-name { font-weight: 600; color: #0f172a; }
.fb-key-edit { display: flex; align-items: center; gap: 4px; }
.fb-key-prefix { color: #6b7280; font-family: monospace; }
.fb-key-edit input {
  flex: 1; border: 1px solid #d1d5db; border-radius: 5px;
  padding: 4px 8px; font-family: monospace; font-size: 12px; min-width: 100px;
  text-transform: uppercase;
}
.fb-key-edit input:focus { outline: none; border-color: #1877F2; }
.fb-key-status { font-size: 14px; width: 16px; text-align: center; }
.fb-key-status.saving { color: #6b7280; }
.fb-key-status.saved { color: #16a34a; }
.fb-key-status.error { color: #dc2626; }
.fb-unrouted-info {
  margin-top: 14px; padding: 10px 14px; background: #fef3c7;
  border: 1px solid #fde68a; border-radius: 7px;
  display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #92400e;
}
.fb-unrouted-info .fb-pill.warn { background: #fbbf24; color: #78350f; }
.fb-link { color: #1877F2; text-decoration: none; margin-left: auto; font-weight: 600; }
.fb-link:hover { text-decoration: underline; }

.fb-pill.warn { background: #fef3c7; color: #92400e; }
.fb-help { margin-top: 24px; }
.fb-help details {
  background: white; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 10px 14px; margin-bottom: 8px;
}
.fb-help summary { cursor: pointer; font-weight: 600; font-size: 13px; color: #0f172a; }
.fb-help ol, .fb-help ul { margin: 10px 0 4px 20px; font-size: 13px; color: #374151; }
.fb-help li { margin-bottom: 5px; line-height: 1.5; }
.fb-help code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: monospace; color: #0f172a; font-size: 12px; }
.fb-help a { color: #1877F2; text-decoration: none; }
.fb-help a:hover { text-decoration: underline; }

/* Modal */
.fb-modal-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
}
.fb-modal {
  background: white; border-radius: 12px; max-width: 480px; width: calc(100vw - 40px);
  display: flex; flex-direction: column;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
}
.fb-modal-head {
  display: flex; align-items: center; padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb; font-weight: 700; font-size: 15px;
}
.fb-modal-head span { flex: 1; }
.fb-modal-head button {
  background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;
}
.fb-modal-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.fb-form-row { display: flex; flex-direction: column; gap: 4px; }
.fb-form-row label { font-size: 12.5px; font-weight: 600; color: #374151; }
.fb-form-row .req { color: #dc2626; }
.fb-form-row input, .fb-form-row textarea {
  border: 1px solid #d1d5db; border-radius: 7px; padding: 8px 12px; font-size: 13px;
  font-family: inherit;
}
.fb-form-row textarea { resize: vertical; font-family: monospace; }
.fb-form-hint { font-size: 11.5px; color: #6b7280; }
.fb-form-err {
  background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b;
  border-radius: 7px; padding: 8px 12px; font-size: 12.5px;
}
.fb-modal-foot {
  display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e5e7eb;
  justify-content: flex-end; background: #fafafa;
}
</style>
