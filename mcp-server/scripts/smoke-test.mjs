import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expectedKey = 'local-smoke-key';
let globalEnabled = true;

const api = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.headers['x-api-key'] !== expectedKey) {
    response.statusCode = 401;
    response.end(JSON.stringify({ error: 'Invalid API key' }));
    return;
  }

  if (request.url === '/api/public/ai/pause' && request.method === 'POST') globalEnabled = false;
  else if (request.url === '/api/public/ai/resume' && request.method === 'POST') globalEnabled = true;
  else if (request.url !== '/api/public/ai/status' || request.method !== 'GET') {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  response.end(JSON.stringify({
    globalEnabled,
    scope: 'all',
    fullAuto: true,
    followupEnabled: false,
  }));
});

await new Promise((resolve, reject) => {
  api.once('error', reject);
  api.listen(0, '127.0.0.1', resolve);
});

const address = api.address();
assert(address && typeof address === 'object');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: process.cwd(),
  env: {
    ZALOCRM_API_BASE: `http://127.0.0.1:${address.port}`,
    ZALOCRM_API_KEY: expectedKey,
  },
});
const client = new Client({ name: 'zalocrm-smoke-test', version: '1.0.0' });

try {
  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ['bat_tu_van', 'tat_tu_van', 'xem_trang_thai'],
  );

  const paused = await client.callTool({ name: 'tat_tu_van', arguments: {} });
  assert.match(paused.content[0].text, /TẮT/);
  assert.equal(globalEnabled, false);

  const resumed = await client.callTool({ name: 'bat_tu_van', arguments: {} });
  assert.match(resumed.content[0].text, /BẬT/);
  assert.equal(globalEnabled, true);

  const status = await client.callTool({ name: 'xem_trang_thai', arguments: {} });
  assert.match(status.content[0].text, /mọi khách/);

  console.log('MCP smoke test passed: 3 tools registered and API calls verified.');
} finally {
  await client.close().catch(() => undefined);
  await new Promise((resolve) => api.close(resolve));
}
