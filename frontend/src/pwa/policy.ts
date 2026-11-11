/** Static shell only. Never turn a dynamic/private URL into a cache key. */
export const SHELL_CACHE_PREFIX = 'crm-pwa-shell-';
export const CONTROL_URL = '/pwa/control.json';
export interface ShellEntry { url: string; revision?: string | null }

export function isStaticShellPath(path: string): boolean {
  return path === '/index.html'
    || /^\/assets\/[^/]+\.(?:js|css|woff2?|ttf|otf)$/.test(path)
    || /^\/pwa\/icons\/(?:icon-(?:180|192|512)|maskable-512)\.png$/.test(path);
}

export function isSpaPath(path: string): boolean {
  // Only known SPA route families. Files, media/object URLs, API and socket paths never fall back.
  if (path.includes('.') || path.includes('//')) return false;
  return /^\/(?:login|setup|setup-password|account|media|profile|analytics|reports-co-ban|zalo-accounts)?\/?$/.test(path)
    || /^\/chat(?:\/[^/]+)?\/?$/.test(path)
    || /^\/contacts(?:\/[^/]+\/profile)?\/?$/.test(path)
    || /^\/customers\/[^/]+\/?$/.test(path)
    || /^\/appointments(?:\/action)?\/?$/.test(path)
    || /^\/(?:reports|settings)(?:\/[a-z0-9-]+){0,3}\/?$/.test(path);
}

export function shellCacheName(entries: ShellEntry[]): string {
  let hash = 2166136261;
  const text = entries.map(e => `${e.url}:${e.revision ?? ''}`).sort().join('|');
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${SHELL_CACHE_PREFIX}${(hash >>> 0).toString(16)}`;
}

export async function readServerPolicy(): Promise<boolean | null> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 3000);
  try {
    const response = await fetch(CONTROL_URL, { cache: 'no-store', credentials: 'omit', signal: abort.signal });
    if (!response.ok) return null;
    const policy: unknown = await response.json();
    return policy && typeof policy === 'object' && 'enabled' in policy && typeof policy.enabled === 'boolean'
      ? policy.enabled : null;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

export function isShellContentType(path: string, contentType: string): boolean {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (path === '/index.html') return type === 'text/html';
  if (path.endsWith('.js')) return type === 'text/javascript' || type === 'application/javascript';
  if (path.endsWith('.css')) return type === 'text/css';
  if (path.endsWith('.png')) return type === 'image/png';
  return /\.(?:woff2?|ttf|otf)$/.test(path) && /^(?:font\/|application\/(?:font|x-font|octet-stream))/.test(type);
}

/** CacheStorage is origin-wide; never delete stores belonging to another app on the same origin. */
export function isCrmOwnedCache(name: string, origin?: string): boolean {
  if (name.startsWith(SHELL_CACHE_PREFIX) || /^(?:crm-user-|zalocrm[-_:])/.test(name)) return true;
  return !!origin && (name === `workbox-runtime-${origin}/` || /^workbox-precache-v\d+-/.test(name) && name.endsWith(`-${origin}/`));
}

export function isCrmUserDatabase(name: string): boolean {
  return /^(?:crm|zalocrm)[-_:]/.test(name) || name === 'workbox-expiration';
}
