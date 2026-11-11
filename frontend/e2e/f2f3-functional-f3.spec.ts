// QA F3 — Tài khoản › Khác (Marketing / Nhóm / Bạn bè) trên mobile. API giả hoàn toàn; chỉ-đọc: assert mọi request là GET.
// Bản đang kiểm: COMMUNITY (frontend/src/_ee vắng). Nhánh Enterprise (isExtension) KHÔNG được kiểm ở đây.
import { expect, test, type Page } from '@playwright/test';
import { APP, PHONE_390 } from './helpers/f2f3-env';
import type { FakeUser } from './helpers/mock-api';
import { gate } from './helpers/mock-f2f3';
import { SALE, boot, bodyText, open } from './f2f3-helpers';

test.use({ serviceWorkers: 'block' });
const MEMBER_FRIEND: FakeUser = { ...SALE, id: 'qa-user-friend', fullName: 'QA Bạn bè', grants: { conversation: { access: true }, contact: { access: true }, friend: { access: true }, media: { access: true } } };

const ROW = '[data-row]';
const ids = (page: Page) => page.locator('[data-menu-id]').evaluateAll(els => els.map(e => e.getAttribute('data-menu-id')));

async function menuGroups(page: Page) {
  return page.locator('.m-menu__group').evaluateAll(gs => gs.map(g => ({ title: g.querySelector('.m-menu__heading')?.textContent?.trim(), items: Array.from(g.querySelectorAll('[data-menu-id]')).map(b => b.getAttribute('data-menu-id')) })));
}

test.describe('F3 menu Tài khoản theo vai trò', () => {
  test('admin: nhóm "Khác" có Marketing, Nhóm, Bạn bè; mục công việc đủ', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390);
    await open(page, '/account', '[data-menu-id]');
    const g = await menuGroups(page);
    expect(g.find(x => x.title === 'Khác')?.items).toEqual(['marketing', 'groups', 'friends']);
    expect(g.find(x => /Công việc/i.test(x.title ?? ''))?.items).toEqual(expect.arrayContaining(['nick', 'media', 'org-settings']));
    await ctx.close();
  });

  test('sale (chỉ hội thoại+khách): thấy Marketing + Nhóm (route chỉ cần đăng nhập), KHÔNG thấy Bạn bè/Kho media/Nick', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390, { user: SALE });
    await open(page, '/account', '[data-menu-id]');
    const all = await ids(page);
    expect(all).toEqual(expect.arrayContaining(['marketing', 'groups']));
    for (const hidden of ['friends', 'media', 'nick', 'org-settings', 'reports']) expect(all, `không được thấy ${hidden}`).not.toContain(hidden);
    await ctx.close();
  });

  test('thành viên có quyền friend+media: thấy Bạn bè + Kho media', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390, { user: MEMBER_FRIEND });
    await open(page, '/account', '[data-menu-id]');
    const all = await ids(page);
    expect(all).toEqual(expect.arrayContaining(['marketing', 'groups', 'friends', 'media']));
    expect(all).not.toContain('nick');
    await ctx.close();
  });

  test('deep link /friends khi KHÔNG có quyền friend: không lộ dữ liệu (guard của router)', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390, { user: SALE });
    await page.goto(`${APP}/friends`);
    await page.waitForTimeout(2500);
    expect(await bodyText(page)).not.toContain('Bạn Zalo 02');
    expect(mock.find('GET', /friends-db/)).toHaveLength(0);
    await ctx.close();
  });

  test('mỗi mục mở đúng trang, tiêu đề đúng, nút Quay lại về /account (cả khi đi sâu vào chức năng khác)', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    for (const [id, url, title] of [['marketing', /\/marketing\/group-scan$/, 'Marketing'], ['groups', /\/groups$/, 'Nhóm Zalo'], ['friends', /\/friends$/, 'Bạn bè']] as const) {
      await open(page, '/account', '[data-menu-id]');
      await page.locator(`[data-menu-id="${id}"]`).click();
      await expect(page).toHaveURL(url);
      await expect(page.locator('.m-tool__title')).toHaveText(title);
      await page.getByRole('button', { name: 'Quay lại' }).click();
      await expect(page).toHaveURL(/\/account$/);
    }
    // đi sâu: Marketing → chip Tệp khách hàng → chi tiết tệp → Quay lại ⇒ /account (không về /marketing/lists)
    await open(page, '/account', '[data-menu-id]');
    await page.locator('[data-menu-id="marketing"]').click();
    await page.locator('[data-feature="lists"]').click();
    const listLink = page.locator('[data-row][href="/marketing/lists/list-1"]');
    await expect(listLink).toBeVisible();
    await listLink.click();
    await expect(page).toHaveURL(/\/marketing\/lists\/list-1$/);
    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(page).toHaveURL(/\/account$/);
    expect(mock.writes()).toEqual([]);
    await ctx.close();
  });
});

test.describe('F3 dữ liệu THẬT đọc được (không chỉ trang giới thiệu)', () => {
  test('Bạn bè: tên khách, nick, trạng thái, đếm theo loại; đổi loại/nick/tìm kiếm/tải thêm gửi đúng GET', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await open(page, '/friends', ROW);
    const text = await bodyText(page);
    expect(text).toContain('Nguyễn Văn Khách 01'); // tên CRM
    expect(text).toContain('Bạn Zalo 02'); // tên Zalo
    expect(text).toMatch(/Tương tác \d+ giờ trước/);
    expect(text).toMatch(/Kết bạn \d+\/\d+\/2026/);
    expect(text).toContain('VIP · Cần gọi lại');
    await expect(page.locator('[data-kind="friend"]')).toContainText(/Đã kết bạn \(\d+\)/);
    await expect(page.locator('.m-trl__badge').first()).toBeVisible();
    // nick mặc định = nick đầu tiên → endpoint theo nick; chọn "Tất cả nick" → /friends-db/all-nicks, dòng có "Nick ..."
    const first = mock.find('GET', /friends-db/)[0];
    expect(first.path).toBe('/zalo-accounts/qa-nick-1/friends-db');
    expect(first.query).toMatchObject({ page: '1', sortBy: 'recent' });
    await page.locator('.m-tnp__select').selectOption('all');
    await expect.poll(() => mock.find('GET', /^\/friends-db\/all-nicks$/).length).toBeGreaterThan(0);
    await expect(page.locator(ROW).first()).toContainText(/Nick (Nick )?Giả \d/);
    await page.locator('.m-tnp__select').selectOption('qa-nick-1');
    await expect.poll(() => mock.find('GET', /^\/zalo-accounts\/qa-nick-1\/friends-db$/).length).toBeGreaterThan(1);
    // loại
    await page.locator('[data-kind="pending_friend"]').click();
    await expect.poll(() => mock.find('GET', /friends-db/).pop()!.query.kind).toBe('pending_friend');
    await expect(page.locator('.m-trl__badge', { hasText: 'Đang chờ' }).first()).toBeVisible();
    await page.locator('[data-kind="all"]').click();
    // tìm kiếm
    await page.locator('.m-trl__search input').fill('Khách 04');
    await expect.poll(() => mock.find('GET', /friends-db/).pop()!.query.search, { timeout: 5000 }).toBe('Khách 04');
    await expect(page.locator(ROW).first()).toContainText('Khách 04');
    await page.locator('.m-trl__search input').fill('');
    // tải thêm (47 bạn / trang)
    const more = page.locator('[data-action="load-more"]');
    await more.scrollIntoViewIfNeeded();
    await more.click();
    await expect.poll(() => mock.find('GET', /friends-db/).pop()!.query.page).toBe('2');
    expect(mock.writes(), 'F3 chỉ đọc: không POST/PATCH/DELETE').toEqual([]);
    await ctx.close();
  });

  test('Nhóm: danh sách nhóm + số thành viên; mở nhóm → sheet thành viên có vai trò; không nút ghi', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390, { nick: 'qa-nick-1' });
    await open(page, '/groups', ROW);
    await expect(page.locator(ROW).first()).toContainText('Nhóm khách hàng 01');
    await expect(page.locator(ROW).first()).toContainText('18 thành viên');
    await expect(page.getByText('Nhóm khách hàng thân thiết khu vực phía Nam có tên dài')).toBeVisible();
    expect(mock.find('GET', /^\/zalo-accounts\/qa-nick-1\/groups$/).length).toBeGreaterThan(0);
    await page.locator(ROW).first().click();
    const sheet = page.locator('.m-sheet:visible');
    await expect(sheet).toContainText('Thành viên nhóm 01');
    await expect(sheet).toContainText('Trưởng nhóm');
    await expect(sheet).toContainText('Phó nhóm');
    expect(mock.find('GET', /groups\/grp-01\/members$/)).toHaveLength(1);
    // tìm kiếm trong thành viên: lọc client, không gọi API thêm
    const n = mock.requests.length;
    await sheet.locator('.m-trl__search input').fill('nhóm 07');
    await expect(sheet.locator(ROW)).toHaveCount(1);
    expect(mock.requests.length).toBe(n);
    expect(mock.writes()).toEqual([]);
    // nick không có nhóm → trạng thái rỗng
    await page.keyboard.press('Escape');
    await page.locator('.m-tnp__select').selectOption('qa-nick-2');
    await expect(page.getByText('Nick này chưa có nhóm')).toBeVisible();
    await ctx.close();
  });

  test('Marketing › Quét nhóm: lần quét + số liệu; mở → thành viên phân trang, KHÔNG có ô tìm (API không hỗ trợ)', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390, { nick: 'qa-nick-1' });
    await open(page, '/marketing/group-scan', ROW);
    await expect(page.locator(ROW).first()).toContainText('Nhóm khách hàng 01, Nhóm khách hàng 02');
    await expect(page.locator(ROW).first()).toContainText('64 thành viên · 21 đã là bạn · 43 chưa là bạn');
    await expect(page.locator(ROW).nth(1)).toContainText(/Lần quét|Quét ngày/);
    await page.locator(ROW).first().click();
    const sheet = page.locator('.m-sheet:visible');
    await expect(sheet).toContainText('Thành viên quét 001');
    await expect(sheet).toContainText('Đã là bạn');
    await expect(sheet.locator('.m-trl__search')).toHaveCount(0);
    const lim = Number(mock.find('GET', /group-scans\/scan-1\/members$/)[0].query.limit);
    await expect(sheet.locator(ROW)).toHaveCount(lim);
    await sheet.locator('[data-action="load-more"]').click();
    await expect(sheet.locator(ROW)).toHaveCount(64); // 64 thành viên: trang 2 là phần còn lại
    const calls = mock.find('GET', /group-scans\/scan-1\/members$/);
    expect(calls.map(c => c.query.page)).toEqual(['1', '2']);
    expect(calls.every(c => Number(c.query.limit) <= 200)).toBe(true);
    expect(mock.writes()).toEqual([]);
    await ctx.close();
  });

  test('Marketing › Tệp khách hàng: danh sách → chi tiết với dòng SĐT/Zalo, link quay về danh sách', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await open(page, '/marketing/lists', ROW);
    await expect(page.locator(ROW).first()).toContainText('🎯 Khách hội chợ tháng 10');
    await expect(page.locator(ROW).first()).toContainText('120 số · 80 có Zalo · 3 không hợp lệ');
    await expect(page.locator(ROW).first()).toContainText('Tạo bởi Trần Giả Lan');
    expect(mock.find('GET', /^\/customer-lists$/)[0].query).toMatchObject({ status: 'active', page: '1' });
    await page.locator(ROW).first().click();
    await expect(page.locator('.m-ml__name')).toHaveText('Khách hội chợ tháng 10');
    await expect(page.locator('.m-ml__stat')).toContainText('120 số · 80 có Zalo');
    await expect(page.locator(ROW).first()).toContainText('09000');
    await expect(page.locator('.m-trl__badge', { hasText: 'Không hợp lệ' }).first()).toBeVisible();
    await expect(page.locator('.m-trl__badge', { hasText: 'Có Zalo' }).first()).toBeVisible();
    await page.locator('[data-action="back-to-lists"]').click();
    await expect(page).toHaveURL(/\/marketing\/lists$/);
    // tìm kiếm tệp → GET search
    await page.locator('.m-trl__search input').fill('Đối tác');
    await expect(page.locator(ROW)).toHaveCount(1);
    expect(mock.find('GET', /^\/customer-lists$/).pop()!.query.search).toBe('Đối tác');
    expect(mock.writes()).toEqual([]);
    await ctx.close();
  });

  test('Marketing › các chức năng còn lại hiện dữ liệu thật (mục tiêu, gửi hàng loạt, luồng, khối, mẫu, phiên chăm sóc)', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    const want: Array<[string, RegExp[]]> = [
      ['targets', [/Kết bạn khách hội chợ/, /Đã gửi 14\/60/, /Từ tệp Khách hội chợ tháng 10/, /Nick Giả 1/, /Tạm dừng/]],
      ['broadcasts', [/Thông báo khuyến mãi tháng 11/, /Hằng tuần/, /Lần gần nhất: gửi 40, lỗi 2, bỏ qua 3/]],
      ['sequences', [/Bám đuổi 7 ngày/, /3 bước/, /Đang bật/, /Đã tắt/]],
      ['content-blocks', [/Giới thiệu sản phẩm/, /Chào anh\/chị, bên em gửi/, /Dùng 12 lần/]],
      ['message-templates', [/Chào khách mới/, /Gõ \/chao/]],
      ['care-sessions', [/Khách Giả A/, /Bám đuổi 7 ngày · Nick (Nick )?Giả 1/, /Đang chạy/]],
    ];
    for (const [slug, patterns] of want) {
      await open(page, `/marketing/${slug}`, ROW);
      const t = await bodyText(page);
      for (const p of patterns) expect(t, `${slug}: ${p}`).toMatch(p);
    }
    expect(mock.writes()).toEqual([]);
    await ctx.close();
  });

  test('không có hành động nặng: không nút Xóa/Tạo/Gửi/Quét/Đồng bộ/Kết bạn/Chặn; có ghi chú "Dùng máy tính"', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390, { nick: 'qa-nick-1' });
    const heavy = /^(Xóa|Tạo|Thêm|Gửi|Quét|Nhập|Đồng bộ|Kết bạn|Chặn|Lưu|Tải lên|Xuất)/;
    for (const url of ['/friends', '/groups', '/marketing/group-scan', '/marketing/lists', '/marketing/targets', '/marketing/broadcasts']) {
      await open(page, url, ROW);
      const buttons = await page.locator('.m-tool button:not([data-kind]), .m-tool a:not([data-feature]):not(.m-tool__alt-link)').evaluateAll(els => els.map(e => (e.getAttribute('aria-label') || e.textContent || '').trim()));
      const bad = buttons.filter(b => heavy.test(b));
      expect(bad, `${url} nút nặng`).toEqual([]);
      await expect(page.locator('.crm-dn')).toContainText('Dùng máy tính');
    }
    expect(mock.writes()).toEqual([]);
    await ctx.close();
  });
});

test.describe('F3 loading / lỗi / rỗng / không quyền / offline', () => {
  test('Bạn bè: loading → ready; 500 → lỗi + Thử lại; 403 → không quyền; rỗng', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    const slow = gate();
    mock.addRule({ match: /friends-db/, hold: slow.p, times: 1 });
    await page.goto(`${APP}/friends`);
    await expect(page.locator('.m-feedback--loading').first()).toBeVisible({ timeout: 15_000 });
    slow.release();
    await expect(page.locator(ROW).first()).toBeVisible();
    mock.addRule({ match: /friends-db/, status: 500, times: 1 });
    await page.locator('[data-kind="ghost"]').click();
    await expect(page.getByRole('heading', { name: /Không tải được/ })).toBeVisible();
    await page.getByRole('button', { name: /Thử lại/ }).click();
    await expect(page.locator(ROW).first()).toBeVisible();
    mock.addRule({ match: /friends-db/, status: 403, body: { error: 'x' }, times: 1 });
    await page.locator('[data-kind="chatting_stranger"]').click();
    await expect(page.getByText('Bạn không có quyền xem mục này.')).toBeVisible();
    mock.addRule({ match: /friends-db/, body: { friends: [], total: 0, counts: {} }, times: 1 });
    await page.locator('[data-kind="friend"]').click();
    await expect(page.locator('.m-feedback--empty, .m-feedback').first()).toBeVisible();
    await ctx.close();
  });

  test('Tệp khách hàng: lỗi mạng → trạng thái lỗi/offline có Thử lại; tải lại được', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    mock.addRule({ match: /^GET \/customer-lists$/, abort: true, times: 1 });
    await page.goto(`${APP}/marketing/lists`);
    await expect(page.getByRole('button', { name: /Thử lại/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Thử lại/ }).click();
    await expect(page.locator(ROW).first()).toContainText('Khách hội chợ tháng 10');
    await ctx.close();
  });

  test('Nhóm: mất mạng hẳn → "Đang mất kết nối" + Thử lại; có mạng lại tải lại', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390, { nick: 'qa-nick-1' });
    await open(page, '/groups', ROW);
    await page.locator('.m-tnp__select').selectOption('qa-nick-2'); // rỗng (đã tải)
    await expect(page.getByText('Nick này chưa có nhóm')).toBeVisible();
    mock.addRule({ match: /^GET \/zalo-accounts\/qa-nick-1\/groups$/, abort: true, times: 1 });
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); window.dispatchEvent(new Event('offline')); });
    await page.locator('.m-tnp__select').selectOption('qa-nick-1');
    await expect(page.getByText(/mất kết nối/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Thử lại/ })).toBeVisible();
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true }); window.dispatchEvent(new Event('online')); });
    // có mạng lại → danh sách tự tải lại (chỉ đọc), không cần bấm
    await expect(page.locator(ROW).first()).toContainText('Nhóm khách hàng 01', { timeout: 10_000 });
    await ctx.close();
  });

  test('Quét nhóm rỗng + Phiên chăm sóc 403 hiện lỗi chung (giới hạn đã biết của useCareSessions)', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390, { nick: 'qa-nick-2' });
    await open(page, '/marketing/group-scan', '.m-tool__title');
    await expect(page.getByText('Chưa có lần quét nào')).toBeVisible();
    mock.addRule({ match: /^GET \/automation\/care-sessions$/, status: 403, body: { error: 'x' } });
    await page.goto(`${APP}/marketing/care-sessions`);
    const t = await page.locator('.m-tool').innerText();
    test.info().annotations.push({ type: 'known-limit', description: `care-sessions 403 hiển thị: ${t.replace(/\s+/g, ' ').slice(0, 200)}` });
    await expect(page.getByRole('heading', { name: /Không tải được|không có quyền/i }).first()).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  });
});
