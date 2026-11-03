// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
export type ReadyHealth = {
  status: 'ok' | 'error';
  db: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  uptime: number;
  timestamp: string;
  /**
   * Trạng thái kênh Messenger (chỉ thông tin). KHÔNG BAO GIỜ ảnh hưởng statusCode:
   * Docker healthcheck dùng /health/ready — Messenger lỗi không được kéo Zalo xuống.
   */
  messenger?: { status: 'disabled' | 'ready' | 'misconfigured'; inbound: boolean; outbound: boolean };
};

export function buildLiveHealth(uptime = process.uptime()): { status: 'ok'; uptime: number } {
  return { status: 'ok', uptime };
}

export async function buildReadyHealth(input: {
  checkDb: () => Promise<void>;
  checkRedis: () => boolean | Promise<boolean>;
  uptime?: number;
  timestamp?: string;
  messenger?: ReadyHealth['messenger'];
}): Promise<{ statusCode: 200 | 503; body: ReadyHealth }> {
  // Start both dependencies together. Runtime probes own bounded, cancellable
  // connections; this deadline also protects the HTTP contract if a check stalls.
  const bounded = async (check: () => unknown | Promise<unknown>): Promise<boolean> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(check).then(value => value !== false),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 2000); }),
      ]);
    } catch { return false; }
    finally { clearTimeout(timer); }
  };
  const [dbOk, redisOk] = await Promise.all([bounded(input.checkDb), bounded(input.checkRedis)]);
  const db: ReadyHealth['db'] = dbOk ? 'connected' : 'disconnected';
  const redis: ReadyHealth['redis'] = redisOk ? 'connected' : 'disconnected';
  const ok = db === 'connected' && redis === 'connected';
  return {
    statusCode: ok ? 200 : 503,
    body: {
      status: ok ? 'ok' : 'error',
      db,
      redis,
      uptime: input.uptime ?? process.uptime(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      ...(input.messenger ? { messenger: input.messenger } : {}),
    },
  };
}
