import { describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === 'private.example.com') return [{ address: '10.0.0.4', family: 4 }];
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

import { validateAiProviderBaseUrl, parseAiProviderOriginAllowlist } from '../../src/modules/ai/ai-provider-url-policy.js';

describe('ai-provider-url-policy', () => {
  it('accepts public https origins', async () => {
    await expect(validateAiProviderBaseUrl('https://api.example.com/')).resolves.toBe('https://api.example.com');
  });

  it('rejects http, userinfo, query, localhost, and private DNS by default', async () => {
    await expect(validateAiProviderBaseUrl('http://api.example.com')).rejects.toThrow(/HTTPS/);
    await expect(validateAiProviderBaseUrl('https://u:p@api.example.com')).rejects.toThrow(/credentials/);
    await expect(validateAiProviderBaseUrl('https://api.example.com?x=1')).rejects.toThrow(/query/);
    await expect(validateAiProviderBaseUrl('https://127.0.0.1')).rejects.toThrow(/private|special/);
    await expect(validateAiProviderBaseUrl('https://private.example.com')).rejects.toThrow(/private|special/);
  });

  it('supports exact deployment allowlist for private origins', async () => {
    const allowlist = parseAiProviderOriginAllowlist('https://private.example.com');
    await expect(validateAiProviderBaseUrl('https://private.example.com', { allowlist })).resolves.toBe('https://private.example.com');
  });

  it('ignores invalid allowlist entries', () => {
    expect(parseAiProviderOriginAllowlist('not a url,https://ok.example.com/path')).toEqual(new Set(['https://ok.example.com']));
  });
});
