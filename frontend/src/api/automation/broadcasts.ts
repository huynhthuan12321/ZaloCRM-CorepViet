import { api } from '@/api';

export type BroadcastState = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface BroadcastPacing {
  // New shape — Đợt 1 2026-06-05
  randomDelayBetweenSends?: { min: number; max: number }; // ms
  hourStart?: number; // 6
  hourEnd?: number;   // 22
  nickDayCap?: number; // 300
  excludeBlocked?: boolean;
  // Legacy fields (vẫn accept backward compat)
  distributeAcrossNicks?: boolean;
  maxPerNickPerHour?: number;
  allowedHourRange?: [number, number];
}

// 5 kind audience source — Đợt 1
export type SegmentSpec =
  | { kind: 'manual'; contactIds: string[] }
  | { kind: 'filter'; criteria: Record<string, unknown> }
  | { kind: 'customer-list'; listId: string }
  | { kind: 'tag'; tagIds: string[]; match?: 'any' | 'all' }
  | { kind: 'preset-segment'; presetKey: string };

export interface Broadcast {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  channel: string;
  blockId: string;
  segmentSpec: SegmentSpec;
  scheduleKind: 'now' | 'scheduled' | 'recurring';
  scheduledAt: string | null;
  recurringSpec: Record<string, unknown> | null;
  pacing: BroadcastPacing;
  state: BroadcastState;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdById: string;
  resumeCursor: string | null;
  workerStats: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string };
  block?: { id: string; name: string; actionType: string; content: Record<string, unknown>; archivedAt: string | null } | null;
}

const BASE = '/automation/broadcasts';

export async function listBroadcasts(query: { state?: BroadcastState; channel?: string } = {}): Promise<Broadcast[]> {
  const params: Record<string, string> = {};
  if (query.state) params.state = query.state;
  if (query.channel) params.channel = query.channel;
  const { data } = await api.get<{ broadcasts: Broadcast[] }>(BASE, { params });
  return data.broadcasts;
}

export async function getBroadcast(id: string): Promise<Broadcast> {
  const { data } = await api.get<Broadcast>(`${BASE}/${id}`);
  return data;
}

export interface BroadcastCreateInput {
  name: string;
  description?: string;
  channel?: string;
  blockId: string;
  segmentSpec: SegmentSpec;
  scheduleKind?: 'now' | 'scheduled' | 'recurring';
  scheduledAt?: string;
  recurringSpec?: Record<string, unknown>;
  pacing?: BroadcastPacing;
}

export async function createBroadcast(input: BroadcastCreateInput): Promise<Broadcast> {
  const { data } = await api.post<Broadcast>(BASE, input);
  return data;
}

export async function updateBroadcast(id: string, patch: Partial<BroadcastCreateInput>): Promise<Broadcast> {
  const { data } = await api.put<Broadcast>(`${BASE}/${id}`, patch);
  return data;
}

export interface PreviewResult {
  totalResolved: number;
  friendableRecipients: number;
  nonFriendableSkipped: number;
  skipReasons: { noZalo: number; blocked: number; total: number };
  kind: string;
  rejected?: string[];
}

export interface PreviewUnsavedResult extends PreviewResult {
  sample: Array<{ id: string; fullName: string | null; phoneNormalized: string | null; gender: string | null }>;
}

export async function previewBroadcast(id: string): Promise<PreviewResult> {
  const { data } = await api.post<PreviewResult>(`${BASE}/${id}/preview`);
  return data;
}

export async function previewUnsaved(input: { segmentSpec: SegmentSpec; sampleSize?: number }): Promise<PreviewUnsavedResult> {
  const { data } = await api.post<PreviewUnsavedResult>(`${BASE}/preview-unsaved`, input);
  return data;
}

export async function startBroadcast(id: string): Promise<{ ok: boolean; recipientsEnqueued: number; skipReasons?: { noZalo: number; blocked: number; notFriend: number } }> {
  const { data } = await api.post(`${BASE}/${id}/start`);
  return data;
}

export async function pauseBroadcast(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.post(`${BASE}/${id}/pause`);
  return data;
}

export async function resumeBroadcast(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.post(`${BASE}/${id}/resume`);
  return data;
}

export async function cancelBroadcast(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.post(`${BASE}/${id}/cancel`);
  return data;
}

export async function deleteBroadcast(id: string): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}

// ── Helpers Đợt 1 2026-06-05 ───────────────────────────────────────────

export interface PresetSegmentMeta {
  key: string;
  label: string;
  emoji: string;
  description: string;
  tone: 'hot' | 'warning' | 'info' | 'success' | 'neutral';
}

export async function listPresetSegments(): Promise<PresetSegmentMeta[]> {
  const { data } = await api.get<{ segments: PresetSegmentMeta[] }>(`${BASE}/helpers/preset-segments`);
  return data.segments;
}

export interface CustomerListSummary {
  id: string;
  name: string;
  iconEmoji: string | null;
  sourceType: string;
  status: string;
  totalEntries: number;
  hasZaloEntries: number;
  noZaloEntries: number;
  createdAt: string;
}

export async function listCustomerListsForBroadcast(): Promise<CustomerListSummary[]> {
  const { data } = await api.get<{ lists: CustomerListSummary[] }>(`${BASE}/helpers/customer-lists`);
  return data.lists;
}

export interface TagSummary {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  emoji: string | null;
  priority: number;
  usageCount: number;
}

export async function listTagsForBroadcast(): Promise<TagSummary[]> {
  const { data } = await api.get<{ tags: TagSummary[] }>(`${BASE}/helpers/tags`);
  return data.tags;
}
