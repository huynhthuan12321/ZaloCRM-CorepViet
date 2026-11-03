import { Client } from 'pg';
import { Socket } from 'node:net';
import { probeLookup, resolveProbeHost } from '../http/probe-host.js';

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
      socket = new Socket();
      client = new Client({ connectionString, stream: () => socket!,
        connectionTimeoutMillis: 1000, query_timeout: 1000, statement_timeout: 1000 });
      client.on('error', () => {}); // Status only: never expose credentials/errors.
      // Use pg's parsed host, including query-string host overrides and sockets.
      // Leave its URL/auth/SSL parser and original TLS verification host intact.
      if (!client.host.startsWith('/')) {
        const addresses = await resolveProbeHost(client.host, controller.signal);
        controller.signal.throwIfAborted();
        const connect = socket.connect.bind(socket);
        socket.connect = ((port: number, host: string) => connect({ port, host,
          lookup: probeLookup(addresses), autoSelectFamily: true })) as typeof socket.connect;
      }
      controller.signal.throwIfAborted();
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
