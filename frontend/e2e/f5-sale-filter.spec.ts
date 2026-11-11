import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN, SALE, LEADER } from './helpers/mock-api';
import { installChatMocks } from './helpers/mock-chat';
import { pixelDiff } from './helpers/pixel-diff';

// Keep API routing deterministic; service-worker behavior is covered by the PWA suite.
test.use({ serviceWorkers: 'block' });

const A = '11111111-1111-4111-a111-111111111111';
const B = '22222222-2222-4222-a222-222222222222';
const users = [{ id: A, fullName: 'Nhân viên A', isActive: true },
  { id: B, fullName: 'Nhân viên B', isActive: true },
  { id: 'inactive', fullName: 'Đã nghỉ', isActive: false }];
const outRoot = process.env.F5_OUT ?? path.resolve('../docs/mobile-upgrade/qa/F5-sale-filter');

async function setup(page: import('@playwright/test').Page, user = ADMIN) {
  const mock = await installChatMocks(page, { user });
  await page.addInitScript(() => localStorage.setItem('filter-sidebar-collapsed', '1'));
  await page.route('**/api/v1/users', r => r.fulfill({ json: { users } }));
  await page.route('**/api/v1/account-folders**', r => r.fulfill({ json: { folders: [] } }));
  await page.route('**/api/v1/filter-presets**', r => r.fulfill({ json: { presets: [] } }));
  await page.route('**/api/v1/privacy/status', r => r.fulfill({ json: {
    hasPin: false, activeSessionCount: 0, activeSessions: [], lockedUntil: null,
  } }));
  await page.route('**/api/v1/dashboard/action-hub/picker/users', r => r.fulfill({
    json: { users: user === LEADER ? users.filter(u => u.id === A) : users, canViewAll: user === ADMIN },
  }));
  await page.route('**/api/v1/conversations?**', r => {
    const url = new URL(r.request().url());
    const assigned = url.searchParams.get('assignedUserId');
    if (!assigned || assigned === 'unassigned' || assigned === user.id) return r.fallback();
    mock.requests.push({ method: 'GET', path: '/conversations', query: Object.fromEntries(url.searchParams), body: null, contentType: '' });
    const conversations = assigned === A || assigned === B ? [{
      id: `qa-conv-${assigned === A ? 1 : 2}`, threadType: 'user',
      contact: { id: 'f5-contact', fullName: `Khách giao ${assigned === A ? 'A' : 'B'}`,
        assignedUserId: assigned, assignedUser: { id: assigned, fullName: assigned === A ? 'Nhân viên A' : 'Nhân viên B' },
        tags: [], contactAccess: [] },
      zaloAccount: { id: 'qa-nick-1', displayName: 'Nick Giả 1', privacyMode: 'sub', archivedAt: null },
      channelAccount: null, messages: [], unreadCount: 0, isReplied: true, lastMessageAt: '2026-11-07T09:00:00+07:00',
    }] : [];
    return r.fulfill({ json: { conversations, total: conversations.length, hasMore: false } });
  });
  return mock;
}

test('desktop chọn sale, gửi đúng query, reload/back, bỏ lọc', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mock = await setup(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Lọc theo sale phụ trách', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Tìm nhân viên' }).fill('nhan vien a');
  await page.getByRole('button', { name: 'Nhân viên A', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`assignedUserId=${A}`));
  await expect.poll(() => mock.requests.some(r => r.path === '/conversations' && r.query.assignedUserId === A)).toBe(true);
  await expect(page.locator('.sale-view-badge')).toContainText('Đang xem: Nhân viên A');
  await expect(page.getByText('Khách giao A', { exact: true })).toBeVisible();
  await expect(page.getByText('Khách giao B', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.sale-view-badge')).toContainText('Nhân viên A');
  await page.goto(`/chat/qa-conv-2?assignedUserId=${A}`);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`assignedUserId=${A}`));
  await page.getByRole('button', { name: 'Bỏ lọc sale' }).click();
  await expect(page).not.toHaveURL(/assignedUserId/);
});

test('mobile admin draft/apply, giữ URL khi mở thread/back/reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setup(page);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Mở bộ lọc' }).click();
  await expect(page.getByText('Sale phụ trách', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm nhân viên' }).fill('Nhân viên A');
  await page.getByRole('button', { name: 'Nhân viên A', exact: true }).click();
  await expect(page).not.toHaveURL(/assignedUserId/);
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`assignedUserId=${A}`));
  await expect.poll(() => mock.requests.some(r => r.path === '/conversations' && r.query.assignedUserId === A)).toBe(true);
  await expect(page.locator('.m-inbox__chips')).toContainText('Đang xem: Nhân viên A');
  await expect(page.locator('.m-conv-row')).toHaveCount(1);
  await page.locator('.m-conv-row').first().click();
  await expect(page).toHaveURL(new RegExp(`/chat/qa-conv-.*assignedUserId=${A}`));
  await page.goBack();
  await page.reload();
  await expect(page.locator('.m-inbox__chips')).toContainText('Nhân viên A');
  await page.getByRole('button', { name: 'Bỏ lọc sale' }).click();
  await expect(page).not.toHaveURL(/assignedUserId/);
});

test('sale thường chỉ có Khách của tôi; không gọi users/picker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, SALE);
  const calls: string[] = [];
  page.on('request', r => { if (/\/users(?:\?|$)/.test(r.url())) calls.push(r.url()); });
  await page.goto(`/chat?assignedUserId=${A}`);
  await page.getByRole('button', { name: /^Bộ lọc/i }).click();
  await expect(page.getByText('Khách của tôi', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Tìm nhân viên' })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('quản lý chỉ thấy nhân viên trong scope; ẩn người nghỉ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, LEADER);
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Lọc theo sale phụ trách', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nhân viên A', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhân viên B', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Đã nghỉ', exact: true })).toHaveCount(0);
});

test('desktop 1440 trước/sau: đóng Sale không đổi pixel; mở chỉ khác popover', async ({ page, browser }) => {
  test.skip(!process.env.BASE_DIST, 'Cần baseline build');
  await page.setViewportSize({ width: 1440, height: 900 });
  const out = path.join(outRoot, test.info().project.name);
  fs.mkdirSync(out, { recursive: true });
  const shots: Record<string, Buffer> = {};
  const bounds: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const [name, origin] of [['before', 'http://localhost:4175'], ['after', 'http://localhost:4174']]) {
    const p = await page.context().newPage();
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.clock.setFixedTime(new Date('2026-11-10T10:00:00+07:00'));
    await setup(p);
    await p.goto(`${origin}/chat`);
    await p.locator('.filter-sidebar').waitFor();
    await p.waitForTimeout(1500);
    shots[`${name}-closed`] = await p.screenshot({ animations: 'disabled', scale: 'css' });
    await p.getByRole('button', { name: 'Lọc theo sale phụ trách', exact: true }).click();
    await p.getByRole('dialog', { name: 'Sale phụ trách', exact: true }).waitFor();
    bounds.push((await p.locator('.c-popover').boundingBox())!);
    await p.waitForTimeout(200);
    shots[`${name}-open`] = await p.screenshot({ animations: 'disabled', scale: 'css' });
    for (const state of ['closed', 'open']) fs.writeFileSync(path.join(out, `${name}-${state}.png`), shots[`${name}-${state}`]);
    await p.close();
  }
  const closed = await pixelDiff(browser, shots['before-closed'], shots['after-closed']);
  // Popover has a different height; compare the whole remaining desktop by masking the union.
  const mask = async (png: Buffer) => {
    const left = Math.floor(Math.min(...bounds.map(b => b.x)) - 35);
    const top = Math.floor(Math.min(...bounds.map(b => b.y)) - 35);
    const right = Math.ceil(Math.max(...bounds.map(b => b.x + b.width)) + 35);
    const bottom = Math.min(900, Math.ceil(Math.max(...bounds.map(b => b.y + b.height)) + 45));
    const context = await browser.newContext();
    try {
      const p = await context.newPage();
      const encoded = await p.evaluate(async ({ image, left, top, right, bottom }) => {
        const img = new Image(); img.src = `data:image/png;base64,${image}`; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const g = canvas.getContext('2d')!; g.drawImage(img, 0, 0); g.fillStyle = '#fff';
        g.fillRect(left, top, right-left, bottom-top);
        return canvas.toDataURL('image/png').split(',')[1]!;
      }, { image: png.toString('base64'), left, top, right, bottom });
      return Buffer.from(encoded, 'base64');
    } finally { await context.close(); }
  };
  const outside = await pixelDiff(browser, await mask(shots['before-open']), await mask(shots['after-open']));
  fs.writeFileSync(path.join(out, 'pixel-results.json'), JSON.stringify({ closed: { ...closed, diffPngBase64: undefined }, outside: { ...outside, diffPngBase64: undefined } }, null, 2));
  expect(closed.exactDiffPixels).toBe(0);
  expect(outside.exactDiffPixels).toBe(0);
});

// Regression: a hidden stale filter must never broaden the sale's first request.
for (const width of [1440, 390]) for (const saved of ['all', 'unassigned', A]) {
  test(`saved ${saved} is forced to self for sale at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, SALE);
    await page.addInitScript(({ saved, key }) => {
      localStorage.setItem('saleAssigneeId', saved);
      localStorage.setItem(key, JSON.stringify(saved));
    }, { saved, key: `crm.inbox.saleAssigneeId:${SALE.orgId}:${SALE.id}` });
    const requests: string[] = [];
    await page.route('**/api/v1/conversations?**', async r => {
      const assigned = new URL(r.request().url()).searchParams.get('assignedUserId');
      requests.push(assigned ?? 'MISSING');
      return r.fulfill({ json: { conversations: assigned === SALE.id ? [{
        id: 'qa-conv-1', threadType: 'user', contact: { id: 'mine', fullName: 'Khách riêng của sale',
          assignedUserId: SALE.id, assignedUser: { id: SALE.id, fullName: SALE.fullName }, tags: [], contactAccess: [] },
        zaloAccount: { id: 'qa-nick-1', displayName: 'Nick Giả 1', privacyMode: 'sub', archivedAt: null },
        channelAccount: null, messages: [], unreadCount: 0, isReplied: true, lastMessageAt: '2026-11-07T09:00:00+07:00',
      }] : [], total: assigned === SALE.id ? 1 : 0, hasMore: false } });
    });
    await page.goto('/chat');
    await expect(page.getByText('Khách riêng của sale', { exact: true })).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(id => id === SALE.id)).toBe(true);
    const stored = await page.evaluate(key => ({ old: localStorage.getItem('saleAssigneeId'), value: JSON.parse(localStorage.getItem(key)!) }), `crm.inbox.saleAssigneeId:${SALE.orgId}:${SALE.id}`);
    expect(stored).toEqual({ old: null, value: SALE.id });
    if (width === 390) await page.getByRole('button', { name: /bộ lọc/i }).first().click();
    else await page.getByRole('button', { name: 'Lọc theo sale phụ trách', exact: true }).click();
    await expect(page.getByText('Khách của tôi', { exact: true }).last()).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Tìm nhân viên' })).toHaveCount(0);
    await expect(page.getByText('Tất cả sale', { exact: true })).toHaveCount(0);
    if (width === 390) {
      await expect(page.getByRole('checkbox', { name: 'Khách của tôi', exact: true })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Khách của tôi', exact: true })).toBeDisabled();
      await page.locator('[data-action=clear]').click();
      await expect(page.getByText('Khách riêng của sale', { exact: true })).toBeVisible();
      expect(requests.every(id => id === SALE.id)).toBe(true);
    }
    await page.reload();
    await expect(page.getByText('Khách riêng của sale', { exact: true })).toBeVisible();
    expect(requests.every(id => id === SALE.id)).toBe(true);
  });
}
for (const width of [1440, 390]) for (const user of [ADMIN, LEADER]) {
  test(`saved employee retained for ${user.role}/${user.deptRole} at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const mock = await setup(page, user);
    await page.addInitScript(({ id, key }) => localStorage.setItem(key, JSON.stringify(id)), { id: A, key: `crm.inbox.saleAssigneeId:${user.orgId}:${user.id}` });
    await page.goto('/chat');
    await expect(page.getByText('Khách giao A', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`assignedUserId=${A}`));
    expect(mock.requests.filter(r => r.path === '/conversations').every(r => r.query.assignedUserId === A)).toBe(true);
  });
}

test('expanded Sale employee picker does not expand adjacent sections', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('filter-sidebar-collapsed', '0'));
  await page.goto('/chat');
  const next = page.locator('.section-header').filter({ hasText: 'Tương tác' });
  const before = await next.boundingBox();
  await page.getByRole('button', { name: 'Chọn nhân viên phụ trách', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Tìm nhân viên' }).fill('nhan vien a');
  await page.getByRole('button', { name: 'Nhân viên A', exact: true }).click();
  await expect(page.getByText('Khách giao A', { exact: true })).toBeVisible();
  expect(await next.boundingBox()).toEqual(before);
});


test('expanded sale-only row reserves exactly three original row heights', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, SALE);
  await page.addInitScript(() => localStorage.setItem('filter-sidebar-collapsed', '0'));
  await page.goto('/chat');
  const self = page.locator('.sale-self-only');
  await expect(self).toBeVisible();
  const height = await self.evaluate(el => ({ reserved: el.getBoundingClientRect().height, row: el.firstElementChild!.getBoundingClientRect().height }));
  expect(height.reserved).toBe(3 * height.row);
});
