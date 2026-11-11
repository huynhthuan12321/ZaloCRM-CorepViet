import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { config as appConfig } from '../../src/config/index.js';
import { executeAiGeneration } from '../../src/modules/ai/ai-generation-executor.js';
import { authorizeAiData, type AiEvalDataSource } from '../../src/modules/ai/ai-privacy-guard.js';
import { getAiConfig, getProviderApiKey } from '../../src/modules/ai/ai-service.js';

type EvalOperation =
  | 'reply_draft'
  | 'summary'
  | 'sentiment'
  | 'appointment_parse'
  | 'format_rich'
  | 'followup'
  | 'virtual_chat'
  | 'customer_summary'
  | 'rag_answer';

type ProviderOptions = {
  config?: {
    operation?: EvalOperation;
    evalDataSource?: AiEvalDataSource;
  };
};

export class ZaloCrmProvider implements ApiProvider {
  private readonly operation: EvalOperation;
  private readonly evalDataSource: AiEvalDataSource;

  constructor(options: ProviderOptions = {}) {
    this.operation = options.config?.operation ?? 'reply_draft';
    this.evalDataSource = options.config?.evalDataSource ?? 'technical';
  }

  id(): string {
    return `zalocrmProvider:${this.operation}`;
  }

  async callApi(prompt: string, context?: { vars?: Record<string, string> }): Promise<ProviderResponse> {
    const startMs = Date.now();
    try {
      const orgId = appConfig.promptfooEvalOrgId;
      if (!orgId) return { error: 'PROMPTFOO_EVAL_ORG_ID_MISSING' };

      const aiConfig = await getAiConfig(orgId);
      const apiKey = await getProviderApiKey(orgId, aiConfig.provider);
      if (!apiKey) return { error: 'EVAL_ORG_NO_API_KEY' };

      const grant = await authorizeAiData({
        orgId,
        scope: 'operator_text',
        purpose: 'eval',
        actor: { mode: 'background' },
        evalDataSource: this.evalDataSource,
      });

      const system = context?.vars?.system ?? '';
      const maxTokens = context?.vars?.maxTokens ? Number.parseInt(context.vars.maxTokens, 10) : undefined;
      const output = await executeAiGeneration({
        grant,
        orgId,
        provider: aiConfig.provider,
        apiKey,
        model: aiConfig.model,
        system,
        prompt,
        maxTokens: Number.isFinite(maxTokens) ? maxTokens : undefined,
      });

      return {
        output,
        tokenUsage: { total: 0 },
        metadata: {
          provider: aiConfig.provider,
          model: aiConfig.model,
          latencyMs: Date.now() - startMs,
          operation: this.operation,
          evalDataSource: this.evalDataSource,
        },
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export default ZaloCrmProvider;
