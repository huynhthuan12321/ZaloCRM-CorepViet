import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: state.spawn }));
import { probeLookup, resolveProbeHost } from '../../src/shared/http/probe-host.js';

function child() {
  const process = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill: vi.fn(() => true) });
  state.spawn.mockReturnValue(process);
  return process;
}
beforeEach(() => { vi.useFakeTimers(); state.spawn.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('bounded OS hostname resolution', () => {
  it('keeps literal IPv4/IPv6 and avoids subprocesses', async () => {
    const signal = new AbortController().signal;
    expect(await resolveProbeHost('127.0.0.1', signal)).toEqual([{ address: '127.0.0.1', family: 4 }]);
    expect(await resolveProbeHost('[::1]', signal)).toEqual([{ address: '::1', family: 6 }]);
    expect(state.spawn).not.toHaveBeenCalled();
  });
  it('keeps OS localhost/hosts results and waits for child close, without inheriting auth', async () => {
    vi.stubEnv('DATABASE_URL', 'synthetic-private-value');
    const process = child();
    const pending = resolveProbeHost('localhost', new AbortController().signal);
    let settled = false; void pending.then(() => { settled = true; });
    const rows = [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }];
    process.stdout.write(JSON.stringify(rows)); await Promise.resolve();
    expect(settled).toBe(false);
    process.emit('close', 0);
    expect(await pending).toEqual(rows);
    expect(state.spawn.mock.calls[0][1]).toContain('localhost');
    expect(state.spawn.mock.calls[0][2]).toMatchObject({ shell: false, windowsHide: true });
    expect(state.spawn.mock.calls[0][2].env).not.toHaveProperty('DATABASE_URL');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('kills an aborted OS lookup and does not release it before close', async () => {
    const process = child(), controller = new AbortController();
    const pending = resolveProbeHost('localhost', controller.signal).then(() => true, () => false);
    let settled = false; void pending.then(() => { settled = true; });
    controller.abort(); await Promise.resolve();
    expect(process.kill).toHaveBeenCalledWith('SIGKILL'); expect(settled).toBe(false);
    process.emit('close', null); expect(await pending).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds stalled OS resolution and reaps it before rejection', async () => {
    const process = child();
    const pending = resolveProbeHost('localhost', new AbortController().signal).then(() => true, () => false);
    await vi.advanceTimersByTimeAsync(1000); expect(process.kill).toHaveBeenCalledWith('SIGKILL');
    process.emit('close', null); expect(await pending).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('redacts process and malformed-result failures', async () => {
    const process = child();
    const pending = resolveProbeHost('localhost', new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('Probe hostname unavailable');
    process.emit('error', new Error('private OS detail')); process.emit('close', 1); await rejected;
    const retry = resolveProbeHost('localhost', new AbortController().signal);
    const invalid = expect(retry).rejects.toThrow('Probe hostname unavailable');
    process.stdout.write('[{"address":"invalid","family":4}]'); process.emit('close', 0); await invalid;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not launch work for an already aborted caller', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(resolveProbeHost('localhost', controller.signal)).rejects.toThrow();
    expect(state.spawn).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves all addresses for TCP fallback and applies an explicit family', async () => {
    const rows = [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }];
    const lookup = probeLookup(rows) as unknown as (h: string, o: object, cb: (...args: unknown[]) => void) => void;
    const all = vi.fn(), ipv4 = vi.fn();
    lookup('localhost', { all: true }, all); lookup('localhost', { all: true, family: 4 }, ipv4);
    await vi.runAllTimersAsync();
    expect(all).toHaveBeenCalledWith(null, rows); expect(ipv4).toHaveBeenCalledWith(null, [rows[1]]);
  });
});
