import { Client } from 'pg';
import { Socket } from 'node:net';
import { resolveProbeHost } from '../http/probe-host.js';

// A health burst shares one disposable client, never the business Prisma pool.
let pending: Promise<void> | null = null;
export function checkDatabaseReadiness(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const controller = new AbortController();
    let client: Client | undefined;
    let socket: Socket | undefined;
    const deadline = setTimeout(() => {
      controller.abort();
      socket?.destroy();
    }, 1500);
    try {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error('Database unavailable');
      const address = await resolveProbeHost(new URL(connectionString).hostname, controller.signal);
      controller.signal.throwIfAborted();
      socket = new Socket();
      const connect = socket.connect.bind(socket);
      // Keep pg's original URL, auth, SSL policy and hostname for TLS verification.
      // Only the TCP transport uses the bounded resolver's numeric address.
      socket.connect = ((port: number, _host: string) => connect({ port, host: address })) as typeof socket.connect;
      client = new Client({ connectionString, stream: () => socket!,
        connectionTimeoutMillis: 1000, query_timeout: 1000, statement_timeout: 1000 });
      client.on('error', () => {}); // Status only: never expose credentials/errors.
      await client.connect();
      await client.query('SELECT 1');
    } catch {
      throw new Error('Database unavailable');
    } finally {
      clearTimeout(deadline);
      controller.abort();
      socket?.destroy();
      await client?.end().catch(() => {});
    }
  })().finally(() => { pending = null; });
  return pending;
}
