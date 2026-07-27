// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
import { prisma } from '../../shared/database/prisma-client.js';
import type { Prisma } from '@prisma/client';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { logger } from '../../shared/utils/logger.js';
import { generateText, getAiConfig, getProviderApiKey } from './ai-service.js';
import { getProviderBaseUrl } from './provider-registry.js';

const REFRESH_AFTER_MS = 30 * 60 * 1000;
const REFRESH_AFTER_MESSAGES = 5;
const ALLOWED_STAGES = [
  'moi_hoi',
  'dang_tim_hieu',
  'phan_van',
  'sap_chot',
  'da_chot',
  'nguoi_lanh',
  'chua_ro',
] as const;
const NEED_KEYS = [
  'goiQuanTam',
  'nganSach',
  'khuVuc',
  'diemBan',
  'coXeQuay',
  'kinhNghiem',
  'thoiGianKhaiTruong',
] as const;

type CustomerStage = (typeof ALLOWED_STAGES)[number];
type CustomerNeeds = Partial<Record<(typeof NEED_KEYS)[number], string>>;

export interface CustomerSummary {
  summary: string;
  needs: CustomerNeeds;
  stage: CustomerStage;
  concerns: string[];
  nextStep: string;
  updatedAt: string;
  msgCountAtUpdate: number;
}

type JsonObject = Record<string, unknown>;

const inFlight = new Set<string>();

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isUnknown(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('vi-VN');
  return normalized === '' || normalized === 'chưa xác định' || normalized === 'chua xac dinh';
}

function preferNew(newValue: unknown, oldValue: unknown, maxLength: number, fallback = 'chưa xác định'): string {
  const next = cleanString(newValue, maxLength);
  if (!isUnknown(next)) return next;
  const previous = cleanString(oldValue, maxLength);
  return previous || fallback;
}

function readExistingSummary(value: unknown): CustomerSummary | null {
  const raw = asObject(value);
  if (!cleanString(raw.summary, 600)) return null;
  return normalizeCustomerSummary(raw, null, Number(raw.msgCountAtUpdate) || 0, cleanString(raw.updatedAt, 64) || new Date(0).toISOString());
}

export function shouldRefreshCustomerSummary(
  previous: CustomerSummary | null,
  currentMessageCount: number,
  now = new Date(),
): boolean {
  if (!previous) return true;
  const updatedAtMs = Date.parse(previous.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return true;
  const isRecent = now.getTime() - updatedAtMs < REFRESH_AFTER_MS;
  const newMessageCount = Math.max(0, currentMessageCount - previous.msgCountAtUpdate);
  return !isRecent || newMessageCount >= REFRESH_AFTER_MESSAGES;
}

export function normalizeCustomerSummary(
  candidateValue: unknown,
  previous: CustomerSummary | null,
  currentMessageCount: number,
  updatedAt = new Date().toISOString(),
): CustomerSummary {
  const candidate = asObject(candidateValue);
  const candidateNeeds = asObject(candidate.needs);
  const previousNeeds = previous?.needs ?? {};
  const needs: CustomerNeeds = {};
  for (const key of NEED_KEYS) {
    needs[key] = preferNew(candidateNeeds[key], previousNeeds[key], 160);
  }

  const rawStage = cleanString(candidate.stage, 40);
  const stage = rawStage
    ? (ALLOWED_STAGES.includes(rawStage as CustomerStage) ? rawStage as CustomerStage : 'chua_ro')
    : (previous?.stage ?? 'chua_ro');

  const newConcerns = Array.isArray(candidate.concerns)
    ? candidate.concerns.map((item) => cleanString(item, 200)).filter((item) => item && !isUnknown(item)).slice(0, 5)
    : [];
  const oldConcerns = previous?.concerns ?? [];

  return {
    summary: preferNew(candidate.summary, previous?.summary, 600, 'Chưa có đủ thông tin để tóm tắt nhu cầu khách hàng.'),
    needs,
    stage,
    concerns: newConcerns.length > 0 ? newConcerns : oldConcerns.slice(0, 5),
    nextStep: preferNew(candidate.nextStep, previous?.nextStep, 300),
    updatedAt,
    msgCountAtUpdate: Math.max(0, Math.trunc(currentMessageCount)),
  };
}

export function mergeCustomerSummaryMetadata(metadataValue: unknown, summary: CustomerSummary): JsonObject {
  return { ...asObject(metadataValue), customerSummary: summary };
}

function parseModelJson(raw: string): unknown {
  let text = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(text) as unknown;
}

async function updateCustomerSummaryInTenant(input: { orgId: string; contactId: string; conversationId: string }): Promise<void> {
  const { orgId, contactId, conversationId } = input;
  const [contact, conversation, messageCount] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, orgId }, select: { metadata: true } }),
    prisma.conversation.findFirst({ where: { id: conversationId, orgId, contactId }, select: { id: true } }),
    prisma.message.count({ where: { conversationId, isDeleted: false } }),
  ]);
  if (!contact || !conversation) return;

  const metadata = asObject(contact.metadata);
  const previous = readExistingSummary(metadata.customerSummary);
  if (!shouldRefreshCustomerSummary(previous, messageCount)) return;

  const config = await getAiConfig(orgId);
  if (!config.enabled) return;
  const apiKey = await getProviderApiKey(orgId, config.provider);
  if (!apiKey) return;

  const messages = await prisma.message.findMany({
    where: { conversationId, isDeleted: false },
    orderBy: { sentAt: 'desc' },
    take: 30,
    select: { senderType: true, senderName: true, content: true, sentAt: true },
  });
  messages.reverse();
  const conversationText = messages.map((message) => {
    const author = message.senderType === 'self' ? 'nhân viên' : (message.senderName || 'khách hàng');
    return `[${message.sentAt.toISOString()}] ${author}: ${(message.content || '(không có nội dung)').slice(0, 2000)}`;
  }).join('\n');

  const system = "Bạn viết bản tóm tắt hồ sơ khách cho đội bán hàng. Trả về JSON đúng định dạng, không văn xuôi. Giữ thông tin cũ nếu tin mới không mâu thuẫn; trường chưa rõ để 'chưa xác định'; không suy đoán.";
  const user = [
    'Bản tóm tắt cũ:',
    JSON.stringify(previous ?? null),
    '',
    'Hội thoại gần nhất:',
    conversationText,
    '',
    'Trả về đúng một JSON theo định dạng:',
    '{"summary":"string <= 600 ký tự","needs":{"goiQuanTam":"string","nganSach":"string","khuVuc":"string","diemBan":"string","coXeQuay":"string","kinhNghiem":"string","thoiGianKhaiTruong":"string"},"stage":"moi_hoi|dang_tim_hieu|phan_van|sap_chot|da_chot|nguoi_lanh|chua_ro","concerns":["tối đa 5 mục"],"nextStep":"một câu"}',
  ].join('\n');

  const raw = await generateText(
    config.provider,
    apiKey,
    config.model,
    system,
    user,
    400,
    await getProviderBaseUrl(orgId, config.provider),
  );
  const summary = normalizeCustomerSummary(parseModelJson(raw), previous, messageCount);

  // Optimistic safety: only overwrite the metadata snapshot that was summarized. If another
  // feature changed metadata meanwhile, skip this run instead of losing its branch.
  const updated = await prisma.contact.updateMany({
    where: { id: contactId, orgId, metadata: { equals: metadata as Prisma.InputJsonValue } },
    data: { metadata: mergeCustomerSummaryMetadata(metadata, summary) as Prisma.InputJsonValue },
  });
  if (updated.count === 0) logger.info(`[customer-summary] Metadata changed concurrently; skip contact=${contactId}`);
}

/** Best-effort customer memory refresh. This function intentionally never throws to callers. */
export async function updateCustomerSummary(input: { orgId: string; contactId: string; conversationId: string }): Promise<void> {
  const key = `${input.orgId}:${input.contactId}:${input.conversationId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    await withTenant(input.orgId, () => updateCustomerSummaryInTenant(input));
  } catch (error) {
    logger.warn(`[customer-summary] Update failed contact=${input.contactId}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    inFlight.delete(key);
  }
}
