// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Bộ đọc CHỈ-ĐỌC (HTTP GET) cho Bạn bè / Nhóm / Marketing trên mobile (F3). Dùng đúng endpoint, tham số và cách bóc dữ liệu của các
 * composable/màn desktop hiện có (use-friends, use-groups, use-customer-lists, use-care-sessions, *View.vue). Lý do không gọi thẳng
 * các hàm fetch* của chúng: chúng nuốt lỗi (console.error rồi trả mảng rỗng) nên không phân biệt được "rỗng" và "lỗi/offline/không quyền";
 * ở đây lỗi được ném lên để UI hiện đúng trạng thái. KHÔNG có POST/PATCH/DELETE, không mở socket.
 * Tách hàm map thuần để test.
 */
import { api } from '@/api';
import { displayCustomerName } from '@/composables/use-friend-display';
import { relTime } from '@/composables/care-session-view-logic';
import { useCareSessions } from '@/composables/use-care-sessions';
import type { ReadPage, ReadRequest, ReadRow, ReadTone } from './use-mobile-read-list';

const NICK_KEY = 'selected-zalo-account'; // cùng khóa với useSelectedAccount của desktop

export interface NickOption { id: string; label: string; status: string }

export function loadStoredNick(): string {
  try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; }
}
export function storeNick(id: string): void {
  try { if (id && id !== 'all') localStorage.setItem(NICK_KEY, id); } catch { /* bỏ qua */ }
}

export async function fetchNickOptions(): Promise<NickOption[]> {
  const res = await api.get('/zalo-accounts');
  const list = (Array.isArray(res.data) ? res.data : res.data?.accounts ?? []) as Array<Record<string, unknown>>;
  return list.map(a => ({
    id: String(a.id),
    label: String(a.displayName || a.phone || 'Nick chưa đặt tên'),
    status: String(a.status ?? ''),
  }));
}

const fmtDate = (iso: unknown): string => {
  if (typeof iso !== 'string') return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN');
};
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
const dataArray = (d: unknown, key: string): Json[] => {
  const r = d as Record<string, unknown> | null;
  const v = Array.isArray(d) ? d : r?.[key];
  return Array.isArray(v) ? (v as Json[]) : [];
};
const clip = (s: string): string => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

// ───────────────────────── Bạn bè ─────────────────────────
export const FRIEND_KINDS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'friend', label: 'Đã kết bạn' },
  { value: 'pending_friend', label: 'Đang chờ' },
  { value: 'chatting_stranger', label: 'Đang nhắn lạ' },
  { value: 'ghost', label: 'Đã ngắt' },
];
const KIND_BADGE: Record<string, { text: string; tone: ReadTone }> = {
  friend: { text: 'Đã kết bạn', tone: 'ok' },
  pending_friend: { text: 'Đang chờ', tone: 'warn' },
  chatting_stranger: { text: 'Đang nhắn lạ', tone: 'muted' },
  ghost: { text: 'Đã ngắt', tone: 'danger' },
};

export function mapFriendRow(f: Json, showNick: boolean): ReadRow {
  const meta: string[] = [];
  const last = relTime(f.lastInteractionAt ?? null);
  if (last) meta.push(`Tương tác ${last}`);
  if (f.becameFriendAt) meta.push(`Kết bạn ${fmtDate(f.becameFriendAt)}`);
  const score = f.leadScore ?? f.contact?.leadScore;
  if (typeof score === 'number') meta.push(`Điểm ${score}`);
  const tags = Array.isArray(f.crmTagsPerNick) ? (f.crmTagsPerNick as unknown[]).slice(0, 3).map(String) : [];
  if (tags.length) meta.push(tags.join(' · '));
  return {
    id: str(f.id),
    title: displayCustomerName(f),
    subtitle: showNick ? `Nick ${str(f.zaloAccount?.displayName) || 'chưa rõ'}` : undefined,
    meta,
    badge: KIND_BADGE[str(f.relationshipKind)] ?? undefined,
  };
}

export async function fetchFriendsPage(
  nickId: string, kind: string, req: ReadRequest, onCounts?: (c: Record<string, number>) => void,
): Promise<ReadPage> {
  const url = nickId === 'all' ? '/friends-db/all-nicks' : `/zalo-accounts/${nickId}/friends-db`;
  const res = await api.get(url, {
    params: { kind: kind === 'all' ? undefined : kind, page: req.page, limit: req.limit, search: req.search || '', sortBy: 'recent', statusId: '' },
  });
  onCounts?.((res.data?.counts ?? {}) as Record<string, number>);
  const rows = dataArray(res.data, 'friends').map(f => mapFriendRow(f, nickId === 'all'));
  return { rows, total: num(res.data?.total) || rows.length };
}

// ───────────────────────── Nhóm ─────────────────────────
export function mapGroupRow(g: Json): ReadRow {
  const count = num(g.totalMember);
  return { id: str(g.id), title: str(g.name || g.groupName) || 'Nhóm không tên', meta: count ? [`${count} thành viên`] : [] };
}
export async function fetchGroupsPage(nickId: string): Promise<ReadPage> {
  const res = await api.get(`/zalo-accounts/${nickId}/groups`);
  const rows = dataArray(res.data, 'groups').map(mapGroupRow);
  return { rows, total: rows.length };
}
export function mapGroupMemberRow(m: Json): ReadRow {
  return {
    id: str(m.id || m.uid),
    title: str(m.displayName || m.name || m.uid) || 'Thành viên',
    badge: m.isOwner ? { text: 'Trưởng nhóm', tone: 'warn' } : m.isDeputy ? { text: 'Phó nhóm', tone: 'ok' } : undefined,
  };
}
export async function fetchGroupMembers(nickId: string, groupId: string): Promise<ReadPage> {
  const res = await api.get(`/zalo-accounts/${nickId}/groups/${groupId}/members`);
  const rows = dataArray(res.data, 'members').map(mapGroupMemberRow);
  return { rows, total: rows.length };
}

// ───────────────────────── Marketing ─────────────────────────
/** Các lần quét nhóm đã xong của nick (cùng endpoint màn Mục tiêu dùng để chọn nguồn). */
export function mapScanRow(s: Json): ReadRow {
  const names = Array.isArray(s.groupNames) ? (s.groupNames as unknown[]).map(String) : [];
  const date = fmtDate(s.createdAt);
  return {
    id: str(s.id),
    title: names.length ? names.join(', ') : `Lần quét ${date}`.trim(),
    subtitle: date ? `Quét ngày ${date}` : undefined,
    meta: [`${num(s.scannedGroups)} nhóm`, `${num(s.memberCount)} thành viên`, `${num(s.friendCount)} đã là bạn`, `${num(s.notFriendCount)} chưa là bạn`],
  };
}
export async function fetchGroupScans(nickId: string): Promise<ReadPage> {
  const res = await api.get(`/target-jobs/group-scans/${nickId}`);
  const rows = dataArray(res.data, 'scans').map(mapScanRow);
  return { rows, total: rows.length };
}
export function mapScanMemberRow(m: Json): ReadRow {
  return {
    id: str(m.id || m.memberUid),
    title: str(m.displayName || m.zaloName || m.memberUid) || 'Thành viên',
    badge: m.isFriend ? { text: 'Đã là bạn', tone: 'ok' } : { text: 'Chưa là bạn', tone: 'muted' },
    meta: m.isAdmin ? ['Quản trị nhóm'] : [],
  };
}
export async function fetchScanMembers(nickId: string, scanId: string, req: ReadRequest): Promise<ReadPage> {
  const res = await api.get(`/zalo-accounts/${nickId}/group-scans/${scanId}/members`, { params: { page: req.page, limit: req.limit } });
  const rows = dataArray(res.data, 'members').map(mapScanMemberRow);
  return { rows, total: num(res.data?.total) || rows.length };
}

export function mapListRow(l: Json): ReadRow {
  const status = str(l.status);
  const emoji = str(l.iconEmoji);
  return {
    id: str(l.id),
    title: `${emoji ? `${emoji} ` : ''}${str(l.name)}`.trim() || 'Tệp chưa đặt tên',
    subtitle: l.createdBy?.fullName ? `Tạo bởi ${str(l.createdBy.fullName)}` : undefined,
    meta: [`${num(l.totalEntries)} số`, `${num(l.hasZaloEntries)} có Zalo`, `${num(l.invalidEntries)} không hợp lệ`],
    badge: status === 'processing' ? { text: 'Đang xử lý', tone: 'warn' } : status === 'archived' ? { text: 'Đã lưu trữ', tone: 'muted' } : undefined,
    to: `/marketing/lists/${str(l.id)}`,
  };
}
export async function fetchListsPage(req: ReadRequest): Promise<ReadPage> {
  const res = await api.get('/customer-lists', { params: { status: 'active', page: req.page, limit: req.limit, search: req.search || undefined } });
  const rows = dataArray(res.data, 'lists').map(mapListRow);
  return { rows, total: num(res.data?.total) || rows.length };
}
export function mapListEntryRow(e: Json): ReadRow {
  const phone = str(e.phoneLocal || e.phoneE164 || e.phoneRaw);
  const meta: string[] = [];
  if (e.zaloName) meta.push(`Zalo: ${str(e.zaloName)}`);
  if (e.invalidReason) meta.push(str(e.invalidReason));
  return {
    id: str(e.id),
    title: str(e.nameRaw) || phone || 'Dòng chưa có tên',
    subtitle: str(e.nameRaw) ? phone : undefined,
    meta,
    badge: e.phoneValid === false
      ? { text: 'Không hợp lệ', tone: 'danger' }
      : e.hasZalo === true ? { text: 'Có Zalo', tone: 'ok' }
        : e.hasZalo === false ? { text: 'Không có Zalo', tone: 'muted' } : { text: 'Chờ kiểm tra', tone: 'warn' },
  };
}
export async function fetchListEntries(listId: string, req: ReadRequest): Promise<ReadPage> {
  const res = await api.get(`/customer-lists/${listId}/entries`, {
    params: { tab: 'all', page: req.page, limit: req.limit, search: req.search || undefined, sort: 'rowIndex', dir: 'desc' },
  });
  const rows = dataArray(res.data, 'entries').map(mapListEntryRow);
  return { rows, total: num(res.data?.total) || rows.length };
}
export async function fetchListHeader(listId: string): Promise<{ name: string; totalEntries: number; hasZaloEntries: number }> {
  const res = await api.get(`/customer-lists/${listId}`);
  return { name: str(res.data?.name), totalEntries: num(res.data?.totalEntries), hasZaloEntries: num(res.data?.hasZaloEntries) };
}

const TARGET_STATUS: Record<string, { text: string; tone: ReadTone }> = {
  active: { text: 'Đang hoạt động', tone: 'ok' }, paused: { text: 'Tạm dừng', tone: 'warn' }, done: { text: 'Đã xong', tone: 'muted' },
};
export function mapTargetRow(j: Json): ReadRow {
  const src = j.sourceType === 'group_scan' ? 'Từ quét nhóm' : `Từ tệp ${str(j.list?.name) || 'khách hàng'}`;
  return {
    id: str(j.id),
    title: str(j.name) || 'Mục tiêu',
    subtitle: `${src}${j.nick ? ` · Nick ${str(j.nick.displayName || j.nick.phone)}` : ''}`,
    meta: [`Đã gửi ${num(j.sentCount)}/${num(j.maxTotal)}`, `Không có Zalo ${num(j.noZaloCount)}`, `Lỗi ${num(j.failedCount)}`],
    badge: TARGET_STATUS[str(j.status)] ?? { text: str(j.status), tone: 'muted' },
  };
}
const BROADCAST_STATUS: Record<string, { text: string; tone: ReadTone }> = {
  active: { text: 'Đang bật', tone: 'ok' }, paused: { text: 'Tạm dừng', tone: 'warn' }, done: { text: 'Đã xong', tone: 'muted' },
};
const SCHEDULE: Record<string, string> = { once: 'Một lần', daily: 'Hằng ngày', weekly: 'Hằng tuần' };
export function mapBroadcastRow(j: Json): ReadRow {
  const run = j.latestRun;
  const meta = [SCHEDULE[str(j.scheduleType)] ?? str(j.scheduleType)];
  if (j.nextRunAt) meta.push(`Chạy tiếp: ${fmtDate(j.nextRunAt)}`);
  if (run) meta.push(`Lần gần nhất: gửi ${num(run.sentCount)}, lỗi ${num(run.failedCount)}, bỏ qua ${num(run.skippedCount)}`);
  return {
    id: str(j.id),
    title: str(j.name) || 'Gửi tin hàng loạt',
    subtitle: j.nick ? `Nick ${str(j.nick.displayName || j.nick.phone)}` : undefined,
    meta,
    badge: BROADCAST_STATUS[str(j.status)] ?? { text: str(j.status), tone: 'muted' },
  };
}
export function mapSequenceRow(s: Json): ReadRow {
  return {
    id: str(s.id),
    title: str(s.name) || 'Luồng chưa đặt tên',
    subtitle: str(s.description) || undefined,
    meta: [`${num(s.stepCount ?? (Array.isArray(s.steps) ? s.steps.length : 0))} bước`],
    badge: s.enabled === false ? { text: 'Đã tắt', tone: 'muted' } : { text: 'Đang bật', tone: 'ok' },
  };
}
export function mapBlockRow(b: Json): ReadRow {
  const text = str(b.messageText).replace(/\s+/g, ' ').trim();
  return {
    id: str(b.id),
    title: str(b.name) || 'Khối chưa đặt tên',
    subtitle: text ? clip(text) : undefined,
    meta: [`Dùng ${num(b.usageCount)} lần`],
    badge: b.enabled === false ? { text: 'Đã tắt', tone: 'muted' } : undefined,
  };
}
export function mapTemplateRow(t: Json): ReadRow {
  const text = str(t.content).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    id: str(t.id),
    title: str(t.name) || 'Mẫu chưa đặt tên',
    subtitle: text ? clip(text) : undefined,
    meta: t.shortcut ? [`Gõ /${str(t.shortcut)}`] : [],
  };
}

export type MarketingListKey = 'targets' | 'broadcasts' | 'sequences' | 'contentBlocks' | 'messageTemplates' | 'careSessions' | 'manualFollowup';

const CARE_BADGE: Record<string, { text: string; tone: ReadTone }> = {
  running: { text: 'Đang chạy', tone: 'ok' }, paused: { text: 'Tạm dừng', tone: 'warn' },
  completed: { text: 'Hoàn thành', tone: 'muted' }, stopped: { text: 'Đã dừng', tone: 'danger' },
};

/** Danh sách chỉ-đọc theo chức năng (cùng endpoint GET desktop dùng). Server không phân trang các danh sách này -> lọc từ khóa ở client. */
export async function fetchMarketingFeature(key: MarketingListKey, req: ReadRequest): Promise<ReadPage> {
  const q = req.search.trim().toLowerCase();
  const wrap = (rows: ReadRow[]): ReadPage => {
    const r = q ? rows.filter(x => `${x.title} ${x.subtitle ?? ''}`.toLowerCase().includes(q)) : rows;
    return { rows: r, total: r.length };
  };
  switch (key) {
    case 'targets': return wrap(dataArray((await api.get('/target-jobs')).data, 'jobs').map(mapTargetRow));
    case 'broadcasts': return wrap(dataArray((await api.get('/broadcast-jobs')).data, 'jobs').map(mapBroadcastRow));
    case 'sequences': return wrap(dataArray((await api.get('/automation/sequences')).data, 'sequences').map(mapSequenceRow));
    case 'contentBlocks': return wrap(dataArray((await api.get('/content-blocks')).data, 'blocks').map(mapBlockRow));
    case 'messageTemplates': return wrap(dataArray((await api.get('/automation/templates')).data, 'templates').map(mapTemplateRow));
    case 'careSessions':
    case 'manualFollowup': {
      // Dùng đúng composable hiện có (GET /automation/care-sessions); nó chỉ giữ chuỗi `error`, MẤT mã HTTP nên 403 hiện là "lỗi chung"
      // thay vì "không quyền" (giới hạn đã biết; không đổi composable/API trong đợt này).
      const cs = useCareSessions(key === 'manualFollowup' ? 'sequence_manual' : undefined);
      await cs.load({ q: req.search });
      if (cs.error.value) throw new Error(cs.error.value);
      const rows: ReadRow[] = cs.sessions.value.map(s => ({
        id: `${s.id}:${s.contactId}`,
        title: s.contactName || 'Khách chưa có tên',
        subtitle: `${s.sequenceName} · Nick ${s.nickName}`,
        meta: s.nextRunAt ? [`Bước kế: ${relTime(s.nextRunAt)}`] : [],
        badge: CARE_BADGE[s.state],
      }));
      return { rows, total: rows.length };
    }
  }
}
