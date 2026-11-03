import { spawn } from 'node:child_process';
import { getDefaultResultOrder, type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';

// Isolate the OS resolver's non-cancellable getaddrinfo from the app's libuv pool.
// Only a hostname/order crosses this boundary, never dependency URLs or auth.
const lookupProgram = `
  const { lookup } = require('node:dns');
  lookup(process.argv[1], { all: true, order: process.argv[2] }, (err, rows) => {
    if (err) process.exitCode = 1;
    else process.stdout.write(JSON.stringify(rows));
  });
`;

/** OS hosts/NSS/DNS semantics, no address cache. Completion includes child close,
 * even on abort: a timeout must not leave getaddrinfo running in the background. */
export async function resolveProbeHost(host: string, signal: AbortSignal): Promise<LookupAddress[]> {
  host = host.replace(/^\[|\]$/g, '');
  signal.throwIfAborted();
  const family = isIP(host);
  if (family) return [{ address: host, family }];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', lookupProgram, '--', host, getDefaultResultOrder()], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      // Do not inherit NODE_OPTIONS, provider keys, sessions or database auth.
      env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
    });
    let output = '';
    let failed = false;
    const cancel = () => { failed = true; child.kill('SIGKILL'); };
    const timeout = setTimeout(cancel, 1000);
    signal.addEventListener('abort', cancel, { once: true });
    child.on('error', () => { failed = true; });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      if (output.length > 65536) cancel();
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      try {
        if (failed || signal.aborted || code !== 0) throw new Error();
        const rows: unknown = JSON.parse(output);
        if (!Array.isArray(rows) || !rows.length || !rows.every(row =>
          typeof row?.address === 'string' && [4, 6].includes(row.family) && isIP(row.address) === row.family)) throw new Error();
        resolve(rows);
      } catch { reject(new Error('Probe hostname unavailable')); }
    });
  });
}

/** Feed all OS results to Node's TCP family/address fallback, without a second
 * lookup in the app. Keep the original host at the PG/Redis TLS boundary. */
export function probeLookup(rows: LookupAddress[]): LookupFunction {
  type Callback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
  return ((_: string, options: { all?: boolean; family?: number }, callback: Callback) => {
    const candidates = options.family ? rows.filter(row => row.family === options.family) : rows;
    process.nextTick(() => {
      if (!candidates.length) callback(Object.assign(new Error('Probe address unavailable'), { code: 'EAI_ADDRFAMILY' }), []);
      else if (options.all) callback(null, candidates);
      else callback(null, candidates[0].address, candidates[0].family);
    });
  }) as LookupFunction;
}
