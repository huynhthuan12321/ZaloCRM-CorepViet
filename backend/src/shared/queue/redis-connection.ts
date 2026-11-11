// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ════════════════════════════════════════════════════════════════════════
// Luồng Mục Tiêu M1 — BullMQ Redis connection shared (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// Single ioredis client cho tất cả BullMQ queues + workers + Bull Board.
// KHÁC với src/shared/redis-client.ts (general-purpose cache, lazyConnect):
// connection này dedicated cho BullMQ — maxRetriesPerRequest=null (yêu cầu BullMQ),
// enableReadyCheck=false (BullMQ workers recommendation).
//
// AOF persistence: Redis container chạy `--appendonly yes --appendfsync everysec`
// (docker-compose.yml). Verify POC spike 5/5 PASS 2026-06-01.

import { Redis, AbstractConnector, type StandaloneConnectionOptions } from 'ioredis';
import { createConnection as createTcpConnection } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { probeLookup, resolveProbeHost } from '../http/probe-host.js';
import { logger } from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://redis:6379';

let connectionInstance: Redis | null = null;
let connectionFailed = false;

function createConnection(): Redis {
  const redis = new Redis(REDIS_URL, {
    // BullMQ v5 requirement — never timeout single request
    maxRetriesPerRequest: null,
    // BullMQ workers recommendation
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy(times: number): number | null {
      if (times > 100) {
        logger.error(`[bullmq-redis] giving up after ${times} retry attempts`);
        connectionFailed = true;
        return null;
      }
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

  redis.on('connect', () => {
    logger.info(`[bullmq-redis] connected to ${REDIS_URL.replace(/:[^@]*@/, ':***@')}`);
    connectionFailed = false;
  });

  redis.on('error', (err: Error) => {
    if (!connectionFailed) {
      logger.error(`[bullmq-redis] error: ${err.message}`);
    }
  });

  redis.on('close', () => {
    logger.warn('[bullmq-redis] connection closed');
  });

  return redis;
}

export function getBullMQRedis(): Redis {
  if (!connectionInstance) {
    connectionInstance = createConnection();
  }
  return connectionInstance;
}

// Share a disposable, bounded readiness connection. Never queue PING on workers.
let readinessProbe: Promise<boolean> | null = null;
export function isBullMQRedisHealthy(): Promise<boolean> {
  if (readinessProbe) return readinessProbe;
  readinessProbe = (async () => {
    const controller = new AbortController();
    let probe: Redis | undefined;
    const deadline = setTimeout(() => { controller.abort(); probe?.disconnect(); }, 1500);
    try {
      const url = new URL(REDIS_URL);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = await resolveProbeHost(host, controller.signal);
      controller.signal.throwIfAborted();
      // Keep ioredis URL parsing/auth/DB and the original TLS verification host.
      // Only the disposable connector receives pre-resolved OS address results.
      class ProbeConnector extends AbstractConnector {
        private options: StandaloneConnectionOptions;
        constructor(options: unknown) { super(0); this.options = options as StandaloneConnectionOptions; }
        async connect() {
          controller.signal.throwIfAborted();
          const options = { host: this.options.host, port: this.options.port ?? 6379,
            family: this.options.family ?? 0, autoSelectFamily: true, lookup: probeLookup(addresses) };
          this.connecting = true;
          this.stream = this.options.path
            ? createTcpConnection({ path: this.options.path })
            : this.options.tls ? connectTls({ ...options, ...this.options.tls }) : createTcpConnection(options);
          this.stream.once('error', err => { this.firstError = err; });
          return this.stream;
        }
        disconnect() { this.connecting = false; this.stream?.destroy(); }
      }
      probe = new Redis(REDIS_URL, {
        ...(url.protocol === 'rediss:' ? { tls: { servername: host } } : {}),
        Connector: ProbeConnector,
        lazyConnect: true, enableOfflineQueue: false,
        maxRetriesPerRequest: 0, retryStrategy: () => null,
        connectTimeout: 1000, commandTimeout: 1000, disconnectTimeout: 0,
      });
      probe.on('error', () => {});
      await probe.connect();
      return await probe.ping() === 'PONG';
    } catch { return false; }
    finally {
      clearTimeout(deadline);
      controller.abort();
      probe?.disconnect();
    }
  })().finally(() => { readinessProbe = null; });
  return readinessProbe;
}

export async function closeBullMQRedis(): Promise<void> {
  if (connectionInstance) {
    logger.info('[bullmq-redis] closing connection...');
    await connectionInstance.quit();
    connectionInstance = null;
  }
}
