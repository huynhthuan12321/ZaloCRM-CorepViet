// QA F2 — Kho media mobile (chức năng). API giả hoàn toàn (e2e/helpers/mock-f2f3.ts: shape theo api/media.ts + backend media-routes.ts).
// Chạy trên BẢN BUILD (D_APP_PORT, mặc định 4198) bằng Chromium + WebKit desktop (KHÔNG phải Safari iPhone). Viewport 390x844 cảm ứng, trừ khi nêu khác.
// Cử chỉ vuốt: TouchEvent tổng hợp (Chromium thêm bản CDP chạm thật ở test riêng) -> không thay cho thử trên máy thật.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { APP, PHONE_390, PHONES, ensureDir, RES, SHOTS, applyOffline } from './helpers/f2f3-env';
import { gate } from './helpers/mock-f2f3';
import { SALE, boot, bodyText, cell, chooseTarget, confirmDialog, imgId, imgName, open, openMedia, pick, routerPush, swipe, CELLS, PICKS, SEND } from './f2f3-helpers';

test.use({ serviceWorkers: 'block' });
const TARGET_A = 'Khách Giả A'; // qa-conv-1
const TARGET_B = 'Khách Giả B'; // qa-conv-2

const ERR_BOX = '.m-ml__bar .m-ml__err';
const STATUS = '[data-testid="send-status"]';

test.describe('F2 lưới Kho media', () => {
  test('lưới 3 cột, thư mục chỉ của loại đang chọn, đổi tab đúng tham số GET', async ({ browser }, info) => {
    const { ctx, page, mock, errors } = await boot(browser, PHONE_390);
    await openMedia(page);
    await expect(page.locator(CELLS)).toHaveCount(30);
    const cols = await page.locator('.m-mg').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(3);
    // Fixture thật: tên + ảnh thật (img src /qa-media), không placeholder rỗng.
    await expect(page.locator(`${CELLS} img`).first()).toHaveAttribute('src', /\/qa-media\/qa-img-001\.svg/);
    expect(await page.locator(`${CELLS} img`).first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    // thư mục ảnh
    await expect(page.locator('.m-ml__chip')).toHaveText(['Tất cả', 'Sản phẩm mới', 'Khuyến mãi tháng 11 (riêng tư)']);
    const first = mock.find('GET', /^\/media$/)[0];
    expect(first.query).toMatchObject({ kind: 'image', sort: 'recent', limit: '30', skip: '0' });
    expect(first.query.q).toBeUndefined();
    await page.getByRole('tab', { name: 'Video' }).click();
    await expect(page.locator(CELLS)).toHaveCount(8);
    await expect(page.locator('.m-ml__chip')).toHaveText(['Tất cả', 'Video hướng dẫn']);
    expect(mock.find('GET', /^\/media$/).pop()!.query).toMatchObject({ kind: 'video', skip: '0' });
    await expect(page.locator('.m-mg__badge').first()).toContainText(/\d:\d\d/); // thời lượng
    await page.getByRole('tab', { name: 'Tài liệu' }).click();
    await expect(page.locator(CELLS)).toHaveCount(7);
    await expect(page.locator('.m-mg__name').first()).toContainText('Bảng giá 1.pdf');
    await expect(page.locator('.m-mg__size').first()).toContainText(/KB|MB/);
    expect(mock.writes()).toEqual([]); // duyệt kho chỉ GET
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('thư mục: lọc folderId, "Tất cả" trả về, chip riêng tư có biểu tượng khóa', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await page.locator('.m-ml__chip', { hasText: 'Sản phẩm mới' }).click();
    await expect(page.locator(CELLS)).toHaveCount(12);
    expect(mock.find('GET', /^\/media$/).pop()!.query).toMatchObject({ kind: 'image', folderId: 'f-img-new', skip: '0' });
    await expect(page.locator('.m-ml__chip--on')).toHaveText('Sản phẩm mới');
    await page.locator('.m-ml__chip', { hasText: 'Khuyến mãi' }).click();
    await expect(page.locator(CELLS)).toHaveCount(8);
    await expect(page.locator('.m-ml__chip', { hasText: 'Khuyến mãi' }).locator('.mdi-lock-outline')).toHaveCount(1);
    await page.locator('.m-ml__chip', { hasText: 'Tất cả' }).click();
    await expect(page.locator(CELLS)).toHaveCount(30);
    expect(mock.find('GET', /^\/media$/).pop()!.query.folderId).toBeUndefined();
    await ctx.close();
  });

  test('tìm kiếm: debounce, Enter áp ngay, trạng thái rỗng + xóa bộ lọc', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    const before = mock.count('GET', /^\/media$/);
    const box = page.locator('.m-ml__search input');
    await box.fill('ảnh sản phẩm 07');
    await expect(page.locator(CELLS)).toHaveCount(6, { timeout: 5000 }); // 070..075 ("phẩm 07" không khớp 007)
    const q = mock.find('GET', /^\/media$/).pop()!.query;
    expect(q.q).toBe('ảnh sản phẩm 07');
    expect(mock.count('GET', /^\/media$/)).toBe(before + 1); // một request sau debounce, không phải từng ký tự
    await box.fill('khong-co-ket-qua-nay');
    await box.press('Enter');
    await expect(page.getByText('Không có mục phù hợp')).toBeVisible();
    await page.getByRole('button', { name: /Xóa bộ lọc/ }).click();
    await expect(page.locator(CELLS)).toHaveCount(30);
    await expect(box).toHaveValue('');
    await ctx.close();
  });

  test('race tìm kiếm: phản hồi cũ về muộn không ghi đè kết quả mới', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    const slow = gate();
    mock.addRule({ match: /^GET \/media$/, when: r => r.query.q === 'ảnh sản phẩm 01', hold: slow.p, times: 1 });
    const box = page.locator('.m-ml__search input');
    await box.fill('ảnh sản phẩm 01');
    await box.press('Enter'); // request chậm bay
    await expect.poll(() => mock.find('GET', /^\/media$/).filter(r => r.query.q === 'ảnh sản phẩm 01').length).toBe(1);
    await box.fill('ảnh sản phẩm 02');
    await box.press('Enter'); // request nhanh trả trước
    await expect(page.locator(CELLS).first()).toHaveAttribute('aria-label', /Ảnh sản phẩm 02/);
    slow.release(); // phản hồi cũ về SAU
    await page.waitForTimeout(600);
    await expect(page.locator(CELLS).first()).toHaveAttribute('aria-label', /Ảnh sản phẩm 02/);
    const labels = await page.locator(CELLS).evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    expect(labels.every(l => /Ảnh sản phẩm 02/.test(l ?? ''))).toBe(true);
    await ctx.close();
  });

  test('race đổi tab: tab Ảnh chậm về sau không đè lưới Video', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await page.getByRole('tab', { name: 'Tài liệu' }).click();
    await expect(page.locator(CELLS)).toHaveCount(7);
    const slow = gate();
    mock.addRule({ match: /^GET \/media$/, when: r => r.query.kind === 'image', hold: slow.p, times: 1 });
    await page.getByRole('tab', { name: 'Ảnh' }).click(); // chậm
    await page.getByRole('tab', { name: 'Video' }).click(); // nhanh
    await expect(page.locator(CELLS)).toHaveCount(8);
    slow.release();
    await page.waitForTimeout(600);
    await expect(page.locator(CELLS)).toHaveCount(8);
    await expect(page.getByRole('tab', { name: 'Video' })).toHaveAttribute('aria-selected', 'true');
    await ctx.close();
  });

  test('tải thêm: IntersectionObserver + nút dự phòng, skip đúng, không trùng, hết thì báo "Đã hiện N mục"', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await page.locator('.m-ml__sentinel').scrollIntoViewIfNeeded();
    await expect(page.locator(CELLS)).toHaveCount(60, { timeout: 10_000 });
    await page.locator('.m-ml__sentinel').scrollIntoViewIfNeeded();
    await expect(page.locator(CELLS)).toHaveCount(75, { timeout: 10_000 });
    await expect(page.getByText('Đã hiện 75 mục.')).toBeVisible();
    const skips = mock.find('GET', /^\/media$/).filter(r => r.query.kind === 'image').map(r => r.query.skip);
    expect(skips.slice(0, 3)).toEqual(['0', '30', '60']);
    const ids = await page.locator(CELLS).evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    expect(new Set(ids).size).toBe(75);
    await ctx.close();
  });

  test('tải thêm lỗi: hiện "Không tải thêm được, thử lại", giữ lưới cũ, thử lại thành công', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    // Cuộn tự kích hoạt IO trước click trên WebKit; giữ lỗi tới lúc người dùng bấm thử lại.
    const rule = mock.addRule({ match: /^GET \/media$/, when: r => r.query.skip === '30', status: 500 });
    await page.locator('.m-ml__sentinel').scrollIntoViewIfNeeded();
    const retry = page.getByRole('button', { name: 'Không tải thêm được, thử lại' });
    await expect(retry).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator(CELLS)).toHaveCount(30);
    rule.times = 0;
    await retry.click();
    await expect(page.locator(CELLS)).toHaveCount(60);
    await ctx.close();
  });
});

test.describe('F2 trình xem lớn', () => {
  test('mở, nút Trước/Sau (biên bị khóa), chọn, Esc/X đóng, trả focus về ô lưới', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390);
    await openMedia(page);
    await cell(page, imgName(2)).click();
    const viewer = page.locator('.m-viewer');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('.m-viewer__meta')).toContainText('2/30');
    const labels = await viewer.locator('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || e.textContent?.trim()));
    expect(labels).toEqual(expect.arrayContaining(['Đóng trình xem', 'Mục trước']));
    const nextLabel = labels.find(l => l && /Mục (sau|tiếp|kế)/.test(l)) ?? '';
    expect(nextLabel, `nút "tiếp" của viewer (nhãn thực: ${JSON.stringify(labels)})`).not.toBe('');
    await viewer.getByRole('button', { name: nextLabel }).click();
    await expect(viewer.locator('.m-viewer__meta')).toContainText('3/30');
    await viewer.getByRole('button', { name: 'Mục trước' }).click();
    await viewer.getByRole('button', { name: 'Mục trước' }).click();
    await expect(viewer.locator('.m-viewer__meta')).toContainText('1/30');
    await expect(viewer.getByRole('button', { name: 'Mục trước' })).toBeDisabled();
    await viewer.getByRole('button', { name: /Chọn để gửi/ }).click();
    await expect(viewer.getByRole('button', { name: /Đã chọn/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await expect(page.locator('.m-ml__count')).toContainText('1 ảnh');
    // focus trả về ô lưới đã mở (ô số 1 vì đã đổi mục về 1? Viewer nhớ ô MỞ ra = ảnh 2)
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName),
      { message: 'focus sau khi đóng viewer' }).toBe(`Xem ${imgName(2)}`);
    await cell(page, imgName(1)).click();
    await page.getByRole('button', { name: 'Đóng trình xem' }).click();
    await expect(viewer).toBeHidden();
    await ctx.close();
  });

  test('vuốt ngang đổi mục, vuốt xuống đóng, vuốt ngắn bị bỏ qua (TouchEvent tổng hợp)', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390);
    await openMedia(page);
    await cell(page, imgName(5)).click();
    const meta = page.locator('.m-viewer__meta');
    await expect(meta).toContainText('5/30');
    await swipe(page, '.m-viewer__stage', -120, 4); // sang trái = mục sau
    await expect(meta).toContainText('6/30');
    await swipe(page, '.m-viewer__stage', 130, -3); // sang phải = mục trước
    await expect(meta).toContainText('5/30');
    await swipe(page, '.m-viewer__stage', -30, 0); // dưới ngưỡng
    await expect(meta).toContainText('5/30');
    await swipe(page, '.m-viewer__stage', 6, 140); // xuống = đóng
    await expect(page.locator('.m-viewer')).toBeHidden();
    await ctx.close();
  });

  test('Chromium: chạm THẬT qua CDP vuốt đổi mục', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP Input.dispatchTouchEvent chỉ có ở Chromium');
    const { ctx, page } = await boot(browser, PHONE_390);
    await openMedia(page);
    await cell(page, imgName(5)).click();
    await expect(page.locator('.m-viewer__meta')).toContainText('5/30');
    const cdp = await ctx.newCDPSession(page);
    const box = (await page.locator('.m-viewer__stage').boundingBox())!;
    const x = box.x + box.width / 2; const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 25, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.m-viewer__meta')).toContainText('6/30');
    await ctx.close();
  });

  test('video: chạm bắt đầu trên <video> không đổi mục/đóng; nút Sau vẫn chạy; tài liệu có "Mở tệp"', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390);
    await openMedia(page);
    await page.getByRole('tab', { name: 'Video' }).click();
    await cell(page, 'Video giới thiệu 2.mp4').click();
    const meta = page.locator('.m-viewer__meta');
    await expect(meta).toContainText('2/8');
    await expect(page.locator('.m-viewer video')).toHaveAttribute('controls', '');
    await swipe(page, '.m-viewer video', -140, 0);
    await expect(meta).toContainText('2/8');
    await swipe(page, '.m-viewer video', 0, 160);
    await expect(page.locator('.m-viewer')).toBeVisible();
    await page.getByRole('button', { name: /Mục (sau|tiếp|kế)/ }).click();
    await expect(meta).toContainText('3/8');
    await page.getByRole('button', { name: 'Đóng trình xem' }).click();
    await page.getByRole('tab', { name: 'Tài liệu' }).click();
    await cell(page, 'Bảng giá 1.pdf').click();
    await expect(page.getByRole('link', { name: 'Mở tệp' })).toHaveAttribute('href', /qa-doc-001\.pdf/);
    await ctx.close();
  });

  test('chọn thứ 13 trong viewer hiện thông báo trong viewer (không im lặng)', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390);
    await openMedia(page);
    for (let i = 1; i <= 12; i++) await pick(page, imgName(i)).click();
    await expect(page.locator('.m-ml__count')).toContainText('12 ảnh');
    await cell(page, imgName(13)).click();
    await page.locator('.m-viewer').getByRole('button', { name: /Chọn để gửi/ }).click();
    await expect(page.locator('.m-viewer [role="status"]')).toContainText('Tối đa 12');
    await ctx.close();
  });
});

test.describe('F2 gửi: payload đúng + đích bất biến', () => {
  test('1 mục: xác nhận nêu khách+nick, POST /media/:id/send đúng conversationId, không gọi album', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    await expect(page.locator('.m-ml__target')).toContainText(TARGET_A);
    await expect(page.locator('.m-ml__target')).toContainText('Nick Giả 1');
    await pick(page, imgName(3)).click();
    await page.locator(SEND).click();
    const dlg = confirmDialog(page);
    await expect(dlg).toContainText(`Gửi cho ${TARGET_A}?`);
    await expect(dlg).toContainText('1 ảnh');
    await expect(dlg).toContainText('Nick Giả 1');
    expect(mock.mediaSends()).toHaveLength(0); // chưa gửi trước khi xác nhận
    await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => mock.mediaSends().length).toBe(1);
    const r = mock.mediaSends()[0];
    expect(r.path).toBe(`/media/${imgId(3)}/send`);
    expect(r.body).toMatchObject({ conversationId: 'qa-conv-1' });
    await expect(page.locator('.toast-msg', { hasText: `Đã gửi cho ${TARGET_A}` })).toBeVisible();
    await expect(page.locator('.m-ml__bar')).toHaveCount(0); // vùng chọn đã bỏ
    await ctx.close();
  });

  test('"Xem lại" ở hộp xác nhận: không gửi gì', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    await pick(page, imgName(1)).click();
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Xem lại' }).click();
    await page.waitForTimeout(400);
    expect(mock.mediaSends()).toHaveLength(0);
    await expect(page.locator('.m-ml__count')).toContainText('1 ảnh');
    await ctx.close();
  });

  test('album: nhiều ảnh = đúng 1 POST /media/album/send, thứ tự chọn, không gọi gửi đơn', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_B);
    for (const n of [7, 2, 9]) await pick(page, imgName(n)).click();
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => mock.mediaSends().length).toBe(1);
    const r = mock.mediaSends()[0];
    expect(r.path).toBe('/media/album/send');
    expect(r.body).toMatchObject({ conversationId: 'qa-conv-2', assetIds: [imgId(7), imgId(2), imgId(9)] });
    await expect(page.locator('.toast-msg', { hasText: `Đã gửi 3 mục cho ${TARGET_B}` })).toBeVisible();
    await ctx.close();
  });

  test('hỗn hợp ảnh+video+tài liệu: gửi TUẦN TỰ 3 request, cùng conversationId, theo thứ tự chọn', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_B);
    await pick(page, imgName(1)).click();
    await page.getByRole('tab', { name: 'Video' }).click();
    await pick(page, 'Video giới thiệu 1.mp4').click();
    await page.getByRole('tab', { name: 'Tài liệu' }).click();
    await pick(page, 'Bảng giá 1.pdf').click();
    await expect(page.locator('.m-ml__count')).toContainText('1 ảnh, 1 video, 1 tài liệu');
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => mock.mediaSends().length).toBe(3);
    const sends = mock.mediaSends();
    expect(sends.map(s => s.path)).toEqual([`/media/${imgId(1)}/send`, '/media/qa-vid-001/send', '/media/qa-doc-001/send']);
    expect(sends.every(s => (s.body as { conversationId: string }).conversationId === 'qa-conv-2')).toBe(true);
    expect(sends[1].t).toBeGreaterThanOrEqual(sends[0].t); // tuần tự (không song song)
    expect(mock.count('POST', /album/)).toBe(0);
    await ctx.close();
  });

  test('đích bất biến: đổi khách NGAY khi request đang bay thì request đã bay giữ khách cũ; gửi kế tiếp mới tới khách mới', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    await pick(page, imgName(1)).click();
    const slow = gate();
    mock.addRule({ match: /^POST \/media\/[^/]+\/send$/, hold: slow.p, times: 1 });
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => mock.mediaSends().length).toBe(1);
    await expect(page.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();
    await chooseTarget(page, TARGET_B); // đổi đích khi đang bay
    slow.release();
    await expect(page.locator('.toast-msg', { hasText: `Đã gửi cho ${TARGET_A}` })).toBeVisible(); // toast theo khách SNAPSHOT
    expect((mock.mediaSends()[0].body as { conversationId: string }).conversationId).toBe('qa-conv-1');
    await pick(page, imgName(2)).click();
    await page.locator(SEND).click();
    const dlg = confirmDialog(page);
    await expect(dlg).toContainText(`Gửi cho ${TARGET_B}?`);
    await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => mock.mediaSends().length).toBe(2);
    expect((mock.mediaSends()[1].body as { conversationId: string }).conversationId).toBe('qa-conv-2');
    await ctx.close();
  });

  test('bấm Gửi hai lần liên tiếp: chỉ một request', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    await pick(page, imgName(1)).click();
    const slow = gate();
    mock.addRule({ match: /^POST \/media\/[^/]+\/send$/, hold: slow.p, times: 1 });
    await page.locator(SEND).click();
    const ok = confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true });
    await ok.dblclick({ delay: 10 }).catch(() => undefined);
    await page.waitForTimeout(500);
    slow.release();
    await page.waitForTimeout(500);
    expect(mock.mediaSends()).toHaveLength(1);
    await ctx.close();
  });

  test('D1: rời trang khi hộp xác nhận còn mở rồi bấm Gửi → không gửi + toast "Chưa gửi vì bạn đã rời khỏi Kho media."', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    await pick(page, imgName(1)).click();
    await page.locator(SEND).click();
    const dlg = confirmDialog(page);
    await expect(dlg).toBeVisible();
    await routerPush(page, '/account'); // điều hướng không do chạm (như back phần cứng/thông báo)
    await expect(page).toHaveURL(/\/account$/);
    await expect(dlg).toBeVisible(); // hộp singleton mồ côi vẫn còn
    await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.locator('.toast-msg', { hasText: 'Chưa gửi vì bạn đã rời khỏi Kho media.' })).toBeVisible();
    expect(mock.mediaSends()).toHaveLength(0);
    await ctx.close();
  });

  test('gửi một phần album (server báo sent<n): trạng thái bền, bỏ cả album khỏi vùng chọn, không tự gửi lại', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    mock.albumSent.value = 2;
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    for (const n of [1, 2, 3]) await pick(page, imgName(n)).click();
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    const st = page.locator(STATUS);
    await expect(st).toContainText('Đã gửi 2/3 ảnh');
    await expect(page.locator('.m-ml__bar')).toHaveCount(0); // vùng chọn trống nhưng status còn
    await expect(st).toBeVisible();
    await page.waitForTimeout(1200);
    expect(mock.mediaSends()).toHaveLength(1); // không retry
    await st.getByRole('button', { name: 'Đã hiểu' }).click();
    await expect(st).toBeHidden();
    // album thiếu số
    mock.albumSent.value = 'missing';
    for (const n of [4, 5]) await pick(page, imgName(n)).click();
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.locator(STATUS)).toContainText('không báo số ảnh đã gửi');
    // sent = 0: giữ vùng chọn
    await page.locator(STATUS).getByRole('button', { name: 'Đã hiểu' }).click();
    mock.albumSent.value = 0;
    for (const n of [6, 7]) await pick(page, imgName(n)).click();
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.locator(ERR_BOX)).toContainText('0/2'); // sent=0: lỗi rõ ràng, không phải trạng thái "không rõ ảnh nào"
    await expect(page.locator('.m-ml__count')).toContainText('2 ảnh'); // 0 ảnh đi: giữ lựa chọn
    await ctx.close();
  });

  test('mất mạng GIỮA chuỗi gửi hỗn hợp: dừng, không gửi mục còn lại, không replay khi có mạng lại', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_B);
    await pick(page, imgName(1)).click();
    await page.getByRole('tab', { name: 'Video' }).click();
    await pick(page, 'Video giới thiệu 1.mp4').click();
    await page.getByRole('tab', { name: 'Tài liệu' }).click();
    await pick(page, 'Bảng giá 1.pdf').click();
    // Máy chủ đã nhận request #1; chuyển offline trước response để kết thúc request có kiểm soát.
    mock.addRule({ match: /^POST \/media\/[^/]+\/send$/, times: 1, onRequest: async () => {
      await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); window.dispatchEvent(new Event('offline')); });
    } });
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.locator('.m-ml__err')).toContainText('Mất kết nối giữa chừng');
    expect(mock.mediaSends()).toHaveLength(1);
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true }); window.dispatchEvent(new Event('online')); });
    await page.waitForTimeout(1500);
    expect(mock.mediaSends(), 'có mạng lại không được tự gửi lại').toHaveLength(1);
    await expect(page.locator('.m-ml__count')).toContainText('1 video, 1 tài liệu'); // ảnh đã gửi bị bỏ khỏi vùng chọn
    await ctx.close();
  });
});

test.describe('F2 lỗi gửi tiếng Việt (403/409/413/415/429...)', () => {
  const CASES: Array<{ name: string; status: number; body: unknown; expect: RegExp; not?: RegExp }> = [
    { name: '403 PRIVACY_LOCKED (backend: Nick Riêng tư — chỉ chính chủ gửi được.)', status: 403, body: { error: 'Nick Riêng tư — chỉ chính chủ gửi được.', code: 'PRIVACY_LOCKED' }, expect: /Riêng tư.*chính chủ/ },
    { name: '403 không có quyền', status: 403, body: { error: 'Forbidden' }, expect: /không có quyền gửi mục này/, not: /Forbidden/ },
    { name: '409 NICK_ARCHIVED (chỉ nói về nick)', status: 409, body: { error: 'Nick này đã bị xóa — chỉ xem lại lịch sử, không gửi được.', code: 'NICK_ARCHIVED' }, expect: /Nick Zalo của hội thoại đã bị xóa/, not: /mục đã bị xóa/ },
    { name: '413 (chung, không nêu dung lượng bịa)', status: 413, body: { error: 'Request Entity Too Large' }, expect: /Tệp quá lớn nên máy chủ từ chối\. Hãy chọn tệp nhỏ hơn\./, not: /\d+\s?MB|100|500|Request Entity/ },
    { name: '415', status: 415, body: { error: 'Loại tệp không hỗ trợ: x/y' }, expect: /Định dạng tệp chưa được hỗ trợ/, not: /x\/y/ },
    { name: '429 (backend limits.reason)', status: 429, body: { error: 'Vượt hạn mức gửi' }, expect: /Gửi quá nhanh/, not: /Vượt hạn mức/ },
    { name: '404', status: 404, body: { error: 'not found' }, expect: /Không tìm thấy hội thoại hoặc mục trong kho/ },
    { name: '400 NICK_NOT_CONNECTED', status: 400, body: { error: 'Nick Zalo chưa kết nối', code: 'NICK_NOT_CONNECTED' }, expect: /Nick Zalo đang không kết nối/ },
    { name: '400 khác', status: 400, body: { error: 'bad' }, expect: /Yêu cầu gửi không hợp lệ/ },
    { name: '500 mơ hồ (không nói "chưa gửi")', status: 500, body: { error: 'boom' }, expect: /Không chắc mục này đã tới khách chưa/, not: /chưa gửi|boom/ },
  ];
  for (const c of CASES) {
    test(c.name, async ({ browser }) => {
      const { ctx, page, mock } = await boot(browser, PHONE_390);
      await openMedia(page);
      await chooseTarget(page, TARGET_A);
      await pick(page, imgName(1)).click();
      mock.addRule({ match: /^POST \/media\/[^/]+\/send$/, status: c.status, body: c.body });
      await page.locator(SEND).click();
      await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
      const err = page.locator(ERR_BOX);
      await expect(err).toContainText(c.expect);
      if (c.not) expect(await err.innerText()).not.toMatch(c.not);
      expect(mock.mediaSends()).toHaveLength(1); // không tự thử lại
      await page.waitForTimeout(800);
      expect(mock.mediaSends()).toHaveLength(1);
      await ctx.close();
    });
  }
  test('album 413 cũng chung + không nêu dung lượng', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    for (const n of [1, 2]) await pick(page, imgName(n)).click();
    mock.addRule({ match: /^POST \/media\/album\/send$/, status: 413, body: { error: 'x' } });
    await page.locator(SEND).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.locator(ERR_BOX)).toContainText('Tệp quá lớn nên máy chủ từ chối. Hãy chọn tệp nhỏ hơn.');
    await expect(page.locator('.m-ml__count')).toContainText('2 ảnh'); // lỗi rõ ràng: giữ chọn để người dùng sửa
    await ctx.close();
  });
});

test.describe('F2 offline: khóa, không xếp hàng, không replay', () => {
  test('mất mạng: nút Gửi khóa + lý do, bấm không tạo request; có mạng lại không tự gửi', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    await pick(page, imgName(1)).click();
    await applyOffline(page, ctx, true);
    const send = page.locator(SEND);
    await expect(send).toBeDisabled();
    await expect(page.locator('.m-ml__lock')).toContainText('Ảnh và tệp không xếp hàng chờ');
    await send.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    expect(mock.mediaSends()).toHaveLength(0);
    await applyOffline(page, ctx, false);
    await page.waitForTimeout(1500);
    expect(mock.mediaSends(), 'không replay sau khi có mạng').toHaveLength(0);
    await expect(send).toBeEnabled();
    await ctx.close();
  });

  test('offline giữa lúc hộp xác nhận mở: bấm Gửi → không request, báo mất kết nối', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openMedia(page);
    await chooseTarget(page, TARGET_A);
    await pick(page, imgName(1)).click();
    await page.locator(SEND).click();
    const dlg = confirmDialog(page);
    await expect(dlg).toBeVisible();
    await applyOffline(page, ctx, true);
    await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.locator(ERR_BOX)).toContainText('Đang mất kết nối');
    expect(mock.mediaSends()).toHaveLength(0);
    await ctx.close();
  });

  test('tải kho khi lỗi mạng: trạng thái lỗi + Thử lại; có mạng lại tải được', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    mock.addRule({ match: /^GET \/media$/, abort: true, times: 1 });
    await page.goto(`${APP}/media`);
    await expect(page.getByRole('button', { name: /Thử lại/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Thử lại/ }).click();
    await expect(page.locator(CELLS)).toHaveCount(30);
    await ctx.close();
  });
});

test.describe('F2 trạng thái loading/error/empty/forbidden', () => {
  test('loading → ready; 500 → lỗi + thử lại; rỗng; 403 không quyền', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    const slow = gate();
    mock.addRule({ match: /^GET \/media$/, hold: slow.p, times: 1 });
    await page.goto(`${APP}/media`);
    await expect(page.locator('.m-feedback--loading')).toBeVisible();
    slow.release();
    await expect(page.locator(CELLS).first()).toBeVisible();
    mock.addRule({ match: /^GET \/media$/, status: 500, times: 1 });
    await page.getByRole('tab', { name: 'Video' }).click();
    await expect(page.getByRole('heading', { name: 'Không tải được Kho media' })).toBeVisible();
    await page.getByRole('button', { name: /Thử lại/ }).click();
    await expect(page.locator(CELLS)).toHaveCount(8);
    mock.addRule({ match: /^GET \/media$/, body: { items: [], total: 0 }, times: 1 });
    await page.getByRole('tab', { name: 'Tài liệu' }).click();
    await expect(page.getByText('Chưa có mục nào trong mục này')).toBeVisible();
    mock.addRule({ match: /^GET \/media$/, status: 403, body: { error: 'x' }, times: 1 });
    await page.getByRole('tab', { name: 'Ảnh' }).click();
    await expect(page.getByText('Bạn không có quyền xem Kho media.')).toBeVisible();
    await ctx.close();
  });
});

test.describe('F2 sheet Kho media trong thread', () => {
  async function openThreadLibrary(page: import('@playwright/test').Page, conv = 'qa-conv-2') {
    await page.goto(`${APP}/chat/${conv}`);
    await page.locator('.mobile-chat .message-thread.is-mobile').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('.is-mobile .attach-plus-btn').click();
    await page.locator('.m-sheet:visible .m-attach__item', { hasText: 'Kho media' }).click();
    await page.locator('.m-sheet:visible .m-ml').waitFor({ timeout: 15_000 });
  }

  test('đích cố định: hiện KHÁCH + NICK, không có nút Đổi; gửi 1 và album đúng conversationId', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openThreadLibrary(page);
    const target = page.locator('.m-sheet:visible .m-ml__target');
    await expect(target).toContainText('Khách Giả B');
    await expect(target).toContainText('Nick Giả 2');
    await expect(target).toContainText('Lê Giả Minh'); // người phụ trách
    await expect(target.getByRole('button')).toHaveCount(0);
    await expect(page.locator('.m-sheet:visible .m-mg__cell').first()).toBeVisible();
    await page.locator('.m-sheet:visible').locator(`${PICKS}[aria-label="Chọn ${imgName(1)}"]`).click();
    await page.locator(`.m-sheet:visible ${SEND}`).click();
    const dlg = confirmDialog(page);
    await expect(dlg).toContainText('Gửi cho Khách Giả B?');
    await expect(dlg).toContainText('Nick Giả 2');
    await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => mock.mediaSends().length).toBe(1);
    expect(mock.mediaSends()[0].path).toBe(`/media/${imgId(1)}/send`);
    expect(mock.mediaSends()[0].body).toMatchObject({ conversationId: 'qa-conv-2' });
    await page.locator('.m-sheet:visible').locator(`${PICKS}[aria-label="Chọn ${imgName(2)}"]`).click();
    await page.locator('.m-sheet:visible').locator(`${PICKS}[aria-label="Chọn ${imgName(3)}"]`).click();
    await page.locator(`.m-sheet:visible ${SEND}`).click();
    await confirmDialog(page).getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => mock.mediaSends().length).toBe(2);
    expect(mock.mediaSends()[1]).toMatchObject({ path: '/media/album/send', body: { conversationId: 'qa-conv-2', assetIds: [imgId(2), imgId(3)] } });
    await ctx.close();
  });

  test('đổi hội thoại khi sheet đang mở → sheet tự đóng; hộp xác nhận mở dở rồi chấp nhận → không gửi', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openThreadLibrary(page);
    await page.locator('.m-sheet:visible').locator(`${PICKS}[aria-label="Chọn ${imgName(1)}"]`).click();
    await page.locator(`.m-sheet:visible ${SEND}`).click();
    const dlg = confirmDialog(page);
    await expect(dlg).toBeVisible();
    await routerPush(page, '/chat/qa-conv-3'); // đổi hội thoại giữa lúc hộp xác nhận còn mở
    await expect(page.locator('.m-sheet:visible .m-ml')).toHaveCount(0, { timeout: 8000 });
    await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
    await page.waitForTimeout(600);
    expect(mock.mediaSends(), 'đổi hội thoại phải hủy gửi').toHaveLength(0);
    await ctx.close();
  });

  test('offline trong thread: xem được kho nhưng Gửi khóa + lý do, không request', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390);
    await openThreadLibrary(page);
    await page.locator('.m-sheet:visible').locator(`${PICKS}[aria-label="Chọn ${imgName(1)}"]`).click();
    await applyOffline(page, ctx, true);
    await expect(page.locator(`.m-sheet:visible ${SEND}`)).toBeDisabled();
    await expect(page.locator('.m-sheet:visible .m-ml__lock, .m-sheet:visible .m-media__lock').first()).toContainText(/mất kết nối/i);
    await page.waitForTimeout(400);
    expect(mock.mediaSends()).toHaveLength(0);
    await ctx.close();
  });

  test('nick Riêng tư của người khác: mục "Kho media" ở sheet đính kèm bị khóa kèm lý do (không mở được kho)', async ({ browser }) => {
    const { ctx, page, mock } = await boot(browser, PHONE_390, { privateConvs: ['qa-conv-2'] });
    await page.goto(`${APP}/chat/qa-conv-2`);
    await page.locator('.mobile-chat .message-thread.is-mobile').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('.is-mobile .attach-plus-btn').click();
    const item = page.locator('.m-sheet:visible .m-attach__item', { hasText: 'Kho media' });
    await expect(item).toBeDisabled();
    await expect(page.locator('.m-sheet:visible .m-attach__lock')).toBeVisible();
    expect(mock.mediaSends()).toHaveLength(0);
    await ctx.close();
  });
});

test.describe('F2 menu/quyền', () => {
  test('người dùng không có quyền media không thấy "Kho media" trong Tài khoản; /media không là điểm vào menu', async ({ browser }) => {
    const { ctx, page } = await boot(browser, PHONE_390, { user: SALE });
    await open(page, '/account', '[data-menu-id]');
    await expect(page.locator('[data-menu-id="media"]')).toHaveCount(0);
    await expect(page.locator('[data-menu-id="friends"]')).toHaveCount(0);
    await ctx.close();
  });
});

test.afterAll(() => { ensureDir(RES); ensureDir(SHOTS); fs.writeFileSync(path.join(RES, 'f2-functional.marker'), `${new Date().toISOString()} viewports:${PHONES.length}`); });
void bodyText;
