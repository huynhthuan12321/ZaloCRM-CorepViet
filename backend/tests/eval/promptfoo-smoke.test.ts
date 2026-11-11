import { describe, expect, it } from 'vitest';

const SKIP = process.env.SKIP_EVAL_TESTS === '1'
  || process.env.PROMPTFOO_EVAL_ENABLED !== 'true'
  || !process.env.PROMPTFOO_EVAL_ORG_ID;

describe.skipIf(SKIP)('promptfoo smoke', () => {
  it('PF-01 evaluate() loads a minimal local config', async () => {
    const { evaluate } = await import('promptfoo');
    const result = await evaluate({
      providers: [{
        id: 'file://../../promptfoo/providers/zalocrmProvider.ts',
        config: { operation: 'sentiment', evalDataSource: 'technical' },
      }],
      prompts: ['{{prompt}}'],
      tests: [{
        vars: {
          prompt: 'khach: San pham tot lam!',
          system: 'Return JSON: {"label":"positive|neutral|negative","confidence":0-1,"reason":"short"}.',
        },
        assert: [{ type: 'is-json' as const }],
      }],
    });
    expect(result.results).toHaveLength(1);
  }, 30_000);
});
