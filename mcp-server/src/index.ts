import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

type AiStatus = {
  globalEnabled: boolean;
  scope: string;
  fullAuto: boolean;
  followupEnabled: boolean;
};

type ApiResult =
  | { ok: true; status: AiStatus }
  | { ok: false; message: string };

const rawApiBase = process.env.ZALOCRM_API_BASE?.trim();
const apiKey = process.env.ZALOCRM_API_KEY?.trim();

if (!rawApiBase || !apiKey) {
  console.error('Thiếu ZALOCRM_API_BASE hoặc ZALOCRM_API_KEY. Hãy cấu hình biến môi trường trước khi chạy.');
  process.exit(1);
}

const apiBase = rawApiBase.replace(/\/+$/, '');
const apiKeyValue = apiKey as string;

function scopeLabel(scope: string): string {
  switch (scope) {
    case 'manual': return 'chỉ khách bật thủ công';
    case 'new_customers': return 'khách mới';
    case 'all': return 'mọi khách';
    default: return scope || 'chưa rõ';
  }
}

function errorDetail(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const error = (value as Record<string, unknown>).error;
  return typeof error === 'string' && error.trim() ? ` — ${error.trim()}` : '';
}

async function callControlApi(path: string, method: 'GET' | 'POST'): Promise<ApiResult> {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'X-Api-Key': apiKeyValue,
      },
      signal: AbortSignal.timeout(15_000),
    });

    const rawBody = await response.text();
    let body: unknown = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `❌ ZaloCRM từ chối yêu cầu (HTTP ${response.status})${errorDetail(body)}.`,
      };
    }

    const status = body as Partial<AiStatus> | null;
    if (
      !status
      || typeof status.globalEnabled !== 'boolean'
      || typeof status.scope !== 'string'
      || typeof status.fullAuto !== 'boolean'
      || typeof status.followupEnabled !== 'boolean'
    ) {
      return { ok: false, message: '❌ ZaloCRM trả về dữ liệu trạng thái không hợp lệ.' };
    }

    return { ok: true, status: status as AiStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `❌ Không kết nối được tới ZaloCRM: ${message}` };
  }
}

function toolResult(result: ApiResult, successText: (status: AiStatus) => string) {
  if (!result.ok) {
    return {
      content: [{ type: 'text' as const, text: result.message }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: successText(result.status) }],
  };
}

const server = new McpServer({
  name: 'zalocrm-control',
  version: '1.0.0',
});

server.registerTool(
  'tat_tu_van',
  {
    title: 'Tắt tư vấn tự động',
    description: 'Tạm dừng trợ lý AI tự động (ngừng mọi tin tự gửi cho khách).',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async () => toolResult(
    await callControlApi('/api/public/ai/pause', 'POST'),
    () => '✅ Đã tạm dừng trợ lý. Hiện tại: TẮT.',
  ),
);

server.registerTool(
  'bat_tu_van',
  {
    title: 'Bật tư vấn tự động',
    description: 'Bật lại trợ lý AI tự động.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async () => toolResult(
    await callControlApi('/api/public/ai/resume', 'POST'),
    (status) => `▶️ Đã bật lại trợ lý. Hiện tại: BẬT (phạm vi: ${scopeLabel(status.scope)}).`,
  ),
);

server.registerTool(
  'xem_trang_thai',
  {
    title: 'Xem trạng thái tư vấn',
    description: 'Xem trợ lý AI đang bật hay tắt và cấu hình phạm vi hiện tại.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  async () => toolResult(
    await callControlApi('/api/public/ai/status', 'GET'),
    (status) => [
      `ℹ️ Trợ lý hiện đang: ${status.globalEnabled ? 'BẬT' : 'TẮT'}.`,
      `Phạm vi: ${scopeLabel(status.scope)}.`,
      `Chế độ trọn: ${status.fullAuto ? 'BẬT' : 'TẮT'}.`,
      `Nhắc lại khách im lặng: ${status.followupEnabled ? 'BẬT' : 'TẮT'}.`,
    ].join(' '),
  ),
);

const transport = new StdioServerTransport();
await server.connect(transport);
