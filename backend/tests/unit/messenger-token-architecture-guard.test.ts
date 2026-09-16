import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard kiến trúc PR-00: 1 Page = 1 ChannelAccount = 1 TokenCredential.
// Không được hồi sinh kho token FB legacy hay cơ chế mã hoá FB_TOKEN_ENC_KEY trong src/.
const SRC = join(__dirname, '..', '..', 'src');

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTs(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const files = listTs(SRC).map((file) => ({
  path: relative(SRC, file).split(sep).join('/'),
  code: readFileSync(file, 'utf8'),
}));

describe('messenger token architecture guard', () => {
  it('AG-01 scans a non-trivial source tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('AG-02 no src file imports the deprecated shared/crypto/aes-gcm module', () => {
    const offenders = files
      .filter((file) => file.path !== 'shared/crypto/aes-gcm.ts')
      .filter((file) => /from\s+['"][^'"]*crypto\/aes-gcm(\.js)?['"]/.test(file.code)
        || /import\(\s*['"][^'"]*crypto\/aes-gcm(\.js)?['"]\s*\)/.test(file.code))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('AG-03 no src code reads FB_TOKEN_ENC_KEY except the deprecated module', () => {
    const offenders = files
      .filter((file) => file.path !== 'shared/crypto/aes-gcm.ts')
      .filter((file) => /process\.env\.FB_TOKEN_ENC_KEY|envValue\(\s*['"]FB_TOKEN_ENC_KEY/.test(file.code))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('AG-04 no src code touches legacy Facebook token stores via Prisma', () => {
    const legacy = /\.(facebookPageConnection|facebookPageAccount|facebookAppConfig)\s*\.|encryptedFbSystemUserToken/;
    const offenders = files.filter((file) => legacy.test(file.code)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
