import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('ai generation boundary', () => {
  it('keeps provider wrappers behind ai-generation-executor', () => {
    const files = walk(join(process.cwd(), 'src', 'modules', 'ai'))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('ai-generation-executor.ts') && !file.includes(`${join('providers')}`));
    const offenders = files.filter((file) => /providers\/(anthropic|gemini|openai-compat)\.js/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
