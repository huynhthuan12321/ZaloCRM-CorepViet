import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Cancellable c-ares lookup: failed health probes must not occupy libuv's
 * getaddrinfo threads and delay the business PostgreSQL pool. No address cache. */
export async function resolveProbeHost(host: string, signal: AbortSignal): Promise<string> {
  host = host.replace(/^\[|\]$/g, '');
  signal.throwIfAborted();
  if (isIP(host)) return host;
  if (host === 'localhost') return '127.0.0.1';
  const resolver = new Resolver({ timeout: 500, tries: 1 });
  const cancel = () => resolver.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    // Both families are supported without waiting for an unavailable family first.
    const address = await Promise.any([
      resolver.resolve4(host).then(rows => { if (!rows[0]) throw new Error('No address'); return rows[0]; }),
      resolver.resolve6(host).then(rows => { if (!rows[0]) throw new Error('No address'); return rows[0]; }),
    ]);
    signal.throwIfAborted();
    return address;
  } finally {
    signal.removeEventListener('abort', cancel);
    resolver.cancel();
  }
}
