// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
const loginHosts = new Set([
  'www.tiktok.com', 'tiktok.com', 'web-sg.tiktok.com',
  'login-us.www.tiktok.com', 'login-eu.www.tiktok.com',
]);

export function safeLoginHttpDiagnostic(rawUrl, httpStatus, payload) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (!loginHosts.has(url.hostname)
    || !/^\/passport\/web\/[a-z_]+\/?$/.test(url.pathname)) return null;
  const codes = {};
  for (const [prefix, object] of [['', payload], ['data.', payload?.data]]) {
    for (const key of ['error_code', 'status_code', 'status']) {
      const value = object?.[key];
      if (typeof value === 'number' && Number.isSafeInteger(value)) codes[prefix + key] = value;
      else if (typeof value === 'string' && ['new', 'pending', 'scanned', 'confirmed', 'expired', 'success', 'error'].includes(value)) codes[prefix + key] = value;
    }
  }
  return { path: url.pathname, httpStatus, codes };
}

export function isFailedQrCheck(diagnostic, payload) {
  if (diagnostic?.path !== '/passport/web/check_qrconnect/') return false;
  if (diagnostic.httpStatus < 200 || diagnostic.httpStatus >= 300) return true;
  if (['new', 'pending', 'scanned', 'confirmed', 'success'].includes(payload?.data?.status)) return false;
  // Do not assign a meaning to an undocumented numeric code. Require an
  // explicit failure description as well as a nonzero numeric error code.
  const code = diagnostic.codes['data.error_code'] ?? diagnostic.codes.error_code;
  const description = payload?.data?.description ?? payload?.description;
  return Number.isSafeInteger(code) && code !== 0 && typeof description === 'string'
    && /error|failed|unavailable|rejected|denied/i.test(description);
}

export function attachLoginDiagnostics(page) {
  const seen = new Set();
  const requests = new WeakMap();
  let generation = 0;
  let qrFailures = 0;
  let lastQrCheckAt = 0;
  const reset = () => { generation++; qrFailures = 0; lastQrCheckAt = 0; };
  page.on('request', request => {
    const diagnostic = safeLoginHttpDiagnostic(request.url(), 0, null);
    if (!diagnostic) return;
    if (diagnostic.path === '/passport/web/get_qrcode/') reset();
    requests.set(request, generation);
  });
  page.on('response', async response => {
    try {
      if (!safeLoginHttpDiagnostic(response.url(), response.status(), null)) return;
      const responseGeneration = requests.get(response.request());
      const payload = await response.json().catch(() => null);
      const safe = safeLoginHttpDiagnostic(response.url(), response.status(), payload);
      if (safe.path === '/passport/web/check_qrconnect/' && responseGeneration === generation) {
        lastQrCheckAt = Date.now();
        qrFailures = isFailedQrCheck(safe, payload) ? qrFailures + 1 : 0;
      }
      const diagnostic = JSON.stringify(safe);
      if (!seen.has(diagnostic)) {
        if (seen.size > 100) seen.clear();
        seen.add(diagnostic);
        console.log(`login_http ${diagnostic}`);
      }
    } catch { /* Never log response bodies, headers, URL query, or parser errors. */ }
  });
  return {
    reset,
    qrCheckFailed: (now = Date.now()) => qrFailures >= 3 && now - lastQrCheckAt < 30_000,
  };
}
