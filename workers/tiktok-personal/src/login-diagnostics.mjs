// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
export function safeLoginHttpDiagnostic(rawUrl, httpStatus, payload) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (!['www.tiktok.com', 'tiktok.com'].includes(url.hostname)
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

export function attachLoginDiagnostics(page) {
  const seen = new Set();
  page.on('response', async response => {
    try {
      if (!safeLoginHttpDiagnostic(response.url(), response.status(), null)) return;
      const payload = await response.json().catch(() => null);
      const diagnostic = JSON.stringify(safeLoginHttpDiagnostic(response.url(), response.status(), payload));
      if (seen.has(diagnostic)) return;
      if (seen.size > 100) seen.clear();
      seen.add(diagnostic);
      console.log(`login_http ${diagnostic}`);
    } catch { /* Never log response bodies, headers, URL query, or parser errors. */ }
  });
}
