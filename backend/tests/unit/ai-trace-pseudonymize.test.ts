import { describe, expect, it } from 'vitest';
import { hmacPseudonymize } from '../../src/modules/ai/observability/ai-trace-sanitizer.js';

describe('ai-trace-pseudonymize', () => {
  it('O07 is stable for same entity and secret', () => {
    expect(hmacPseudonymize('x'.repeat(32), 'org', 'id-1')).toBe(hmacPseudonymize('x'.repeat(32), 'org', 'id-1'));
  });

  it('O08 differs for different IDs', () => {
    expect(hmacPseudonymize('x'.repeat(32), 'org', 'id-1')).not.toBe(hmacPseudonymize('x'.repeat(32), 'org', 'id-2'));
  });

  it('O09 differs for different secrets', () => {
    expect(hmacPseudonymize('x'.repeat(32), 'org', 'id-1')).not.toBe(hmacPseudonymize('y'.repeat(32), 'org', 'id-1'));
  });

  it('uses domain prefixes', () => {
    expect(hmacPseudonymize('x'.repeat(32), 'org', 'same')).not.toBe(hmacPseudonymize('x'.repeat(32), 'conversation', 'same'));
  });
});
