// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
/**
 * chat-media-helpers.ts
 * Helpers for downloading media URLs to temporary local files before sending
 * them through zca-js. zca-js needs local file paths for attachments.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../../config/index.js';

/** Extract zaloMsgId from different zca-js response shapes. */
export function extractZaloMsgId(result: unknown): string {
  const sr = result as {
    msgId?: string | number;
    data?: { msgId?: string | number };
    message?: { msgId?: string | number } | null;
    attachment?: Array<{ msgId?: string | number }>;
  } | null;
  const raw = sr?.message?.msgId ?? sr?.attachment?.[0]?.msgId ?? sr?.data?.msgId ?? sr?.msgId ?? '';
  return String(raw || '');
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const au = new URL(a);
    const bu = new URL(b);
    return au.protocol === bu.protocol && au.host === bu.host;
  } catch {
    return false;
  }
}

/**
 * Return candidate URLs for downloading media. Prefer the original URL, then
 * add an internal S3 endpoint fallback when the public URL maps to configured S3.
 */
export function candidateDownloadUrls(url: string): string[] {
  const candidates = [url];
  try {
    if (sameOrigin(url, config.s3PublicUrl)) {
      const publicUrl = new URL(config.s3PublicUrl);
      const endpoint = new URL(config.s3Endpoint);
      const original = new URL(url);
      original.protocol = endpoint.protocol;
      original.host = endpoint.host;
      const publicPath = publicUrl.pathname.replace(/\/$/, '');
      if (publicPath && original.pathname.startsWith(publicPath)) {
        original.pathname = original.pathname.slice(publicPath.length) || '/';
      }
      candidates.push(original.toString());
    }
  } catch {
    // Keep original URL only.
  }
  return [...new Set(candidates)];
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]+/g;
const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']+', 'g');

function sanitizeFileName(value?: string): string | undefined {
  const cleaned = value
    ?.replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(CONTROL_CHARS, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || undefined;
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image': return '.jpg';
    case 'video': return '.mp4';
    case 'voice':
    case 'audio': return '.mp3';
    default: return '';
  }
}

function hasExtension(name: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(name);
}

export function filenameFromUrl(url: string, contentType: string, fallback?: string): string {
  const ext = extensionForContentType(contentType);
  const cleanFallback = sanitizeFileName(fallback);
  if (cleanFallback) return hasExtension(cleanFallback) || !ext ? cleanFallback : `${cleanFallback}${ext}`;

  try {
    const name = new URL(url).pathname.split('/').filter(Boolean).pop();
    const cleanName = sanitizeFileName(name ? decodeURIComponent(name) : undefined);
    if (cleanName) return hasExtension(cleanName) || !ext ? cleanName : `${cleanName}${ext}`;
  } catch {
    // Fall through to generated fallback name.
  }
  return `forward-${contentType}${ext}`;
}

/**
 * Download one media URL to a temporary file and return { path, cleanup }.
 * Always call cleanup() in finally after sending.
 */
export async function downloadMediaToTemp(
  media: { url: string; filename?: string },
  contentType: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  let lastError: unknown;
  for (const url of candidateDownloadUrls(media.url)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error('empty response');

      const dir = await mkdtemp(path.join(tmpdir(), 'zalocrm-forward-'));
      const filePath = path.join(dir, filenameFromUrl(url, contentType, media.filename));
      await writeFile(filePath, buffer);
      return { path: filePath, cleanup: () => rm(dir, { recursive: true, force: true }) };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Cannot download media for sending: ${(lastError as Error)?.message ?? String(lastError)}`);
}
