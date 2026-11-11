import type { onSendAsyncHookHandler } from 'fastify';

/** These stable URLs must reach the server before a PWA update/disable decision. */
export function isPwaStaticPath(url: string): boolean {
  const pathname = new URL(url, 'http://localhost').pathname;
  return pathname === '/sw.js' || pathname === '/pwa/control.json' || pathname === '/pwa/kill-sw.js';
}

// onSend runs after @fastify/static has applied its own headers. Its setHeaders
// callback writes raw headers earlier, which the plugin can overwrite.
export const frontendStaticHeaders: onSendAsyncHookHandler = async (request, reply, payload) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/pwa/control.json') {
    reply.header('Cache-Control', 'no-store');
    if (reply.statusCode === 200 || reply.statusCode === 304) {
      reply.header('Content-Type', 'application/json; charset=utf-8');
    }
  } else if (pathname === '/sw.js' || pathname === '/pwa/kill-sw.js') {
    reply.header('Cache-Control', 'no-cache');
    if (reply.statusCode === 200 || reply.statusCode === 304) {
      reply.header('Content-Type', 'application/javascript; charset=utf-8');
    }
  } else if (String(reply.getHeader('Content-Type') ?? '').startsWith('text/html')) {
    // Covers /, /index.html and sendFile('index.html') for SPA deep links.
    reply.header('Cache-Control', 'no-cache');
  }
  return payload;
};
