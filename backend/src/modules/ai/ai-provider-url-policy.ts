// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { config } from '../../config/index.js';

const DNS_TIMEOUT_MS = 3_000;
const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain']);
const METADATA_IPV4 = '169.254.169.254';

export class AiProviderUrlPolicyError extends Error {
  code = 'AI_PROVIDER_URL_REJECTED';

  constructor(message: string) {
    super(message);
    this.name = 'AiProviderUrlPolicyError';
  }
}

function normalizeOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return null;
  }
}

export function parseAiProviderOriginAllowlist(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const item of (raw ?? '').split(',')) {
    const origin = normalizeOrigin(item.trim());
    if (origin) out.add(origin);
  }
  return out;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 ||
    address === METADATA_IPV4
  );
}

function isPrivateIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80:') ||
    lower.startsWith('::ffff:127.') ||
    lower.startsWith('::ffff:10.') ||
    lower.startsWith('::ffff:192.168.') ||
    lower.startsWith('::ffff:169.254.')
  );
}

function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function resolveAll(hostname: string): Promise<string[]> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new AiProviderUrlPolicyError('AI provider DNS validation timed out')), DNS_TIMEOUT_MS),
  );
  const result = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    timer,
  ]);
  return result.map((entry) => entry.address);
}

export async function validateAiProviderBaseUrl(raw: string, options?: { allowlist?: Set<string> }): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AiProviderUrlPolicyError('AI provider base URL is invalid');
  }

  if (url.username || url.password) throw new AiProviderUrlPolicyError('AI provider base URL must not contain credentials');
  if (url.search || url.hash) throw new AiProviderUrlPolicyError('AI provider base URL must not contain query or fragment');
  if (url.pathname !== '/' && url.pathname !== '') throw new AiProviderUrlPolicyError('AI provider base URL must be an origin only');

  const allowlist = options?.allowlist ?? config.aiProviderBaseUrlAllowlist;
  const exactOriginAllowed = allowlist.has(url.origin);
  if (url.protocol !== 'https:') {
    if (!(url.protocol === 'http:' && !config.isProduction && exactOriginAllowed)) {
      throw new AiProviderUrlPolicyError('AI provider base URL must use HTTPS');
    }
  }

  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (port !== '443' && !exactOriginAllowed) {
    throw new AiProviderUrlPolicyError('AI provider base URL uses a non-standard port that is not allowlisted');
  }

  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
    if (!exactOriginAllowed) throw new AiProviderUrlPolicyError('AI provider host is local');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [hostname] : await resolveAll(hostname);
  if (addresses.length === 0) throw new AiProviderUrlPolicyError('AI provider host has no DNS addresses');
  if (!exactOriginAllowed && addresses.some(isBlockedIp)) {
    throw new AiProviderUrlPolicyError('AI provider host resolves to a private or special address');
  }

  return url.origin;
}
