import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_URL, isShellContentType, isSpaPath, isStaticShellPath, readServerPolicy, shellCacheName } from './policy';
afterEach(() => vi.unstubAllGlobals());
describe('PWA cache boundaries', () => {
  it.each(['/api/v1/contacts', '/socket.io/', '/uploads/photo.png', '/media/private.pdf', '/iphone-media/private.png', '/assets/photo.png', '/assets/folder/private.js', '/pwa/control.json'])('never precaches %s', path => { expect(isStaticShellPath(path)).toBe(false); });
  it.each(['/index.html', '/assets/app-hash.js', '/assets/app-hash.css', '/assets/font-hash.woff2', '/pwa/icons/icon-180.png', '/pwa/icons/maskable-512.png'])('allows public shell %s', path => { expect(isStaticShellPath(path)).toBe(true); });
  it.each(['/', '/login', '/chat/fake-id', '/contacts/fake-id/profile', '/settings/personal/profile', '/appointments', '/account'])('SPA navigation %s', path => expect(isSpaPath(path)).toBe(true));
  it.each(['/api/v1/contacts', '/socket.io', '/uploads', '/media/customer.pdf', '/unknown', '/assets/app.js', '/settings/../../api'])('does not fallback %s', path => expect(isSpaPath(path)).toBe(false));
  it('changes cache version only with a different static build', () => {
    expect(shellCacheName([{ url: 'assets/a.js', revision: '1' }])).not.toBe(shellCacheName([{ url: 'assets/a.js', revision: '2' }]));
    expect(shellCacheName([{ url: 'a', revision: '1' }, { url: 'b' }])).toBe(shellCacheName([{ url: 'b' }, { url: 'a', revision: '1' }]));
  });
  it('rejects API JSON or SPA HTML masquerading as a JavaScript asset', () => {
    expect(isShellContentType('/assets/a.js', 'application/json')).toBe(false);
    expect(isShellContentType('/assets/a.js', 'text/html')).toBe(false);
    expect(isShellContentType('/assets/a.js', 'text/javascript; charset=utf-8')).toBe(true);
  });
  it('reads control with no-store and no credentials; false is the server kill-switch', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"enabled":false}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await readServerPolicy()).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(CONTROL_URL, expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
  });
  it('tolerates offline/maintenance/invalid policy without treating it as authentication failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await readServerPolicy()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('maintenance', { status: 503 })));
    expect(await readServerPolicy()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"foo":true}')));
    expect(await readServerPolicy()).toBeNull();
  });
});
