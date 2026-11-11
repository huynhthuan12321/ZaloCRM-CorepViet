// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { getProviderConfig, getProviderBaseUrl } from './provider-registry.js';
import { generateWithAnthropic } from './providers/anthropic.js';
import { generateWithGemini } from './providers/gemini.js';
import { generateWithOpenaiCompat } from './providers/openai-compat.js';
import { assertAiDataGrant, type AiDataGrant } from './ai-privacy-guard.js';
import { validateAiProviderBaseUrl } from './ai-provider-url-policy.js';
import { addSpan, endSpan, type AiTraceContext } from './observability/ai-tracer.js';
import { checkAiCircuitBreaker, recordAiCircuitFailure, recordAiCircuitSuccess } from './ai-circuit-breaker.js';
import { checkAiRateLimit } from './ai-rate-limiter.js';

export async function executeAiGeneration(input: {
  grant: AiDataGrant;
  orgId: string;
  provider: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  trace?: AiTraceContext;
}): Promise<string> {
  assertAiDataGrant(input.grant, input.orgId);
  checkAiRateLimit(input.grant);
  const providerDef = getProviderConfig(input.provider);
  const rawBaseUrl = await getProviderBaseUrl(input.orgId, input.provider);
  const baseUrl = await validateAiProviderBaseUrl(rawBaseUrl || providerDef?.baseUrl || '');
  checkAiCircuitBreaker(input.provider);

  const span = addSpan(input.trace, 'llm_generation');
  try {
    let output: string;
    if (input.provider === 'anthropic') {
      output = await generateWithAnthropic(baseUrl, input.apiKey, input.model, input.system, input.prompt, input.maxTokens);
    } else if (input.provider === 'gemini') {
      output = await generateWithGemini(baseUrl, input.apiKey, input.model, input.system, input.prompt, input.maxTokens);
    } else if (input.provider === 'openai') {
      output = await generateWithOpenaiCompat(`${baseUrl}/v1/chat/completions`, input.apiKey, input.model, input.system, input.prompt, input.maxTokens, 'max_completion_tokens');
    } else if (input.provider === 'qwen') {
      output = await generateWithOpenaiCompat(`${baseUrl}/compatible-mode/v1/chat/completions`, input.apiKey, input.model, input.system, input.prompt, input.maxTokens);
    } else if (input.provider === 'kimi') {
      output = await generateWithOpenaiCompat(`${baseUrl}/v1/chat/completions`, input.apiKey, input.model, input.system, input.prompt, input.maxTokens);
    } else if (input.provider === 'deepseek') {
      output = await generateWithOpenaiCompat(`${baseUrl}/chat/completions`, input.apiKey, input.model, input.system, input.prompt, input.maxTokens);
    } else {
      throw new Error(`Unsupported AI provider: ${input.provider}`);
    }
    recordAiCircuitSuccess(input.provider);
    return output;
  } catch (error) {
    recordAiCircuitFailure(input.provider, error);
    throw error;
  } finally {
    endSpan(span);
  }
}
