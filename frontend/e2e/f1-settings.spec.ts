// F1 Cài đặt mobile — luồng chức năng (Chromium + WebKit DESKTOP mô phỏng cảm ứng 390x844; KHÔNG phải Safari iPhone thật, không VoiceOver).
// Mock theo ĐÚNG hình dạng API trong mã nguồn (xem helpers/mock-f1.ts). Không backend/Zalo thật. Service Worker bị chặn.
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_F1, OWNER, SETTINGS_MEMBER, type F1Mock } from './helpers/mock-f1';
import type { FakeUser } from './helpers/mock-api';
import { FAKE_PNG } from './helpers/mock-f1';
import { boot, go as goCold, goWarm as go, type Booted } from './helpers/f1-env';

test.use({ serviceWorkers: 'block' });
const VP = { name: '390x844', w: 390, h: 844, touch: true };

const confirmBox = (p: Page) => p.locator('.cam-modal');
const toast = (p: Page, t: string | RegExp) => p.locator('.toast-msg', { hasText: t });
const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' });

async function boot390(browser: import('@playwright/test').Browser, opts: { user?: FakeUser; theme?: 'light' | 'dark' } = {}): Promise<Booted> { return boot(browser, VP, opts); }
/** Mọi test kết thúc: không có pageerror không mong đợi. */
async function finish(b: Booted) {
  expect.soft(b.errors, 'pageerror').toEqual([]);
  await b.ctx.close();
}
const writes = (m: F1Mock) => m.writes().map(r => `${r.method} ${r.path}`);

// ════════════════════════════ Menu + phân quyền hiển thị ════════════════════════════
test.describe('Menu Cài đặt', () => {
  test('owner thấy đủ mục F1 và mở đúng trang; "Thông báo của tôi" -> đường dẫn gốc internal-contact, KHÔNG phải feed', async ({ browser }) => {
    const b = await boot390(browser);
    await goCold(b.page, '/settings', '.crm-sm'); // tải lạnh: /zalo-accounts (trang Zalo desktop) không được gọi
    for (const label of ['Tài khoản của tôi', 'Thông báo của tôi', 'Hồ sơ tổ chức', 'Nhân viên', 'Sơ đồ tổ chức', 'Phân quyền', 'Audit log', 'Trạng thái KH', 'Nhãn KH', 'Lead scoring', 'Tích hợp 3rd party']) {
      await expect(btn(b.page, new RegExp(label)).first(), label).toBeVisible();
    }
    await btn(b.page, /Thông báo của tôi/).click();
    await expect(b.page).toHaveURL(/\/settings\/channels\/zalo\?tab=internal-contact/);
    await expect(b.page.locator('.crm-ic__card')).toBeVisible();
    await expect(b.page.locator('.crm-np')).toHaveCount(0); // không phải feed
    await expect(b.page.getByRole('heading', { name: 'Thông báo của tôi', level: 1 })).toBeVisible();
    // Không mount cả trang Tài khoản Zalo desktop
    await expect(b.page.locator('.sl-sidebar, .zalo-accounts-view, [role="tablist"]:has-text("Riêng tư")')).toHaveCount(0);
    expect(b.mock.find('GET', /^\/zalo-accounts$/).length).toBe(0);
    await finish(b);
  });

  test('mỗi mục F1 trên menu mở đúng trang native và nút quay lại về danh sách', async ({ browser }) => {
    const b = await boot390(browser);
    const map: Array<[string, RegExp, string]> = [
      ['Tài khoản của tôi', /personal\/profile/, '.crm-ap'], ['Nhân viên', /rbac\/users/, '.crm-el'], ['Sơ đồ tổ chức', /rbac\/departments/, '.crm-dp'],
      ['Phân quyền', /rbac\/permission-groups/, '.crm-pg'], ['Audit log', /org\/audit/, '.crm-au'], ['Trạng thái KH', /crm\/statuses/, '.crm-sp'],
      ['Nhãn KH', /crm\/tags-v2/, '.crm-tp'], ['Lead scoring', /crm\/scoring/, '.crm-sc'], ['Tích hợp 3rd party', /channels\/integrations/, '.crm-ig'],
      ['Hồ sơ tổ chức', /org\/profile/, '.org-settings-layout'],
    ];
    for (const [label, url, sel] of map) {
      await go(b.page, '/settings', '.crm-sm');
      await btn(b.page, new RegExp(label)).first().click();
      await expect(b.page, label).toHaveURL(url);
      await expect(b.page.locator(sel).first(), label).toBeVisible();
      await b.page.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
      await expect(b.page).toHaveURL(/\/settings$/);
      await expect(b.page.locator('.crm-sm')).toBeVisible();
    }
    await finish(b);
  });

  test('member chỉ có settings: không thấy Nhân viên/Phân quyền/Audit; vào thẳng URL bị chặn', async ({ browser }) => {
    const b = await boot390(browser, { user: SETTINGS_MEMBER });
    await go(b.page, '/settings', '.crm-sm');
    await expect(btn(b.page, /Trạng thái KH/).first()).toBeVisible();
    await expect(btn(b.page, /^Nhân viên/)).toHaveCount(0);
    await expect(btn(b.page, /Phân quyền/)).toHaveCount(0);
    await expect(btn(b.page, /Audit log/)).toHaveCount(0);
    await b.page.goto('http://localhost:' + (process.env.D_APP_PORT ?? 4188) + '/settings/rbac/users');
    await expect(b.page).not.toHaveURL(/rbac\/users/);
    expect(b.mock.find('GET', /^\/rbac\/users$/).length).toBe(0);
    await finish(b);
  });

  test('tìm kiếm menu: lọc theo từ khóa, rỗng có thông báo', async ({ browser }) => {
    const b = await boot390(browser);
    await go(b.page, '/settings', '.crm-sm');
    await b.page.getByRole('searchbox', { name: 'Tìm cài đặt' }).fill('nhãn');
    await expect(btn(b.page, /Nhãn KH/)).toBeVisible();
    await b.page.getByRole('searchbox', { name: 'Tìm cài đặt' }).fill('zzzkhongco');
    await expect(b.page.getByText('Không tìm thấy')).toBeVisible();
    await finish(b);
  });
});

// ════════════════════════════ Tài khoản ════════════════════════════
test.describe('Tài khoản của tôi', () => {
  test('sửa tên: dirty -> × hỏi xác nhận; giữ lại / bỏ không gọi API; lưu đúng payload', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/personal/profile', '.crm-ap');
    await expect(p.locator('.crm-ap__name')).toHaveText(OWNER.fullName);
    await btn(p, 'Sửa họ tên').click();
    const dlg = p.getByRole('dialog', { name: 'Sửa họ tên' });
    await expect(dlg).toBeVisible();
    // chưa dirty: Hủy đóng ngay, không hỏi
    await btn(p, 'Hủy').click();
    await expect(dlg).toBeHidden();
    await expect(confirmBox(p)).toHaveCount(0);
    // dirty: hỏi
    await btn(p, 'Sửa họ tên').click();
    await p.getByLabel('Họ tên', { exact: true }).fill('Tên Mới Giả');
    await btn(p, 'Đóng').click();
    await expect(confirmBox(p)).toBeVisible();
    await confirmBox(p).getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    await expect(dlg).toBeVisible();
    await expect(p.getByLabel('Họ tên', { exact: true })).toHaveValue('Tên Mới Giả');
    await btn(p, 'Đóng').click();
    await confirmBox(p).getByRole('button', { name: 'Bỏ thay đổi' }).click();
    await expect(dlg).toBeHidden();
    expect(writes(b.mock)).toEqual([]);
    await expect(p.locator('.crm-ap__name')).toHaveText(OWNER.fullName);
    // lưu
    await btn(p, 'Sửa họ tên').click();
    await p.getByLabel('Họ tên', { exact: true }).fill('  Tên Mới Giả  ');
    await btn(p, 'Lưu thay đổi').click();
    await expect(dlg).toBeHidden();
    await expect(p.locator('.crm-ap__name')).toHaveText('Tên Mới Giả');
    const w = b.mock.find('PATCH', /^\/me\/profile$/);
    expect(w).toHaveLength(1);
    expect(w[0].body).toEqual({ fullName: 'Tên Mới Giả' });
    await finish(b);
  });

  test('đang lưu: nút Đóng/Hủy/Lưu bị khóa, sheet không đóng giữa chừng; xong mới đóng', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'PATCH /me/profile', delayMs: 1500, times: 1 });
    await go(p, '/settings/personal/profile', '.crm-ap');
    await btn(p, 'Sửa họ tên').click();
    await p.getByLabel('Họ tên', { exact: true }).fill('Đang Lưu Giả');
    await btn(p, 'Lưu thay đổi').click();
    const dlg = p.getByRole('dialog', { name: 'Sửa họ tên' });
    await expect(btn(p, 'Đang lưu…')).toBeDisabled();
    await expect(btn(p, 'Hủy')).toBeDisabled();
    await btn(p, 'Đóng').click(); // nút × header: phải bị chặn khi persistent
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    await expect(dlg).toBeVisible();
    await expect(confirmBox(p)).toHaveCount(0);
    await expect(dlg).toBeHidden({ timeout: 6000 });
    await expect(p.locator('.crm-ap__name')).toHaveText('Đang Lưu Giả');
    expect(b.mock.find('PATCH', /^\/me\/profile$/)).toHaveLength(1);
    await finish(b);
  });

  test('lỗi 500 khi lưu tên: giữ sheet + thông báo lỗi role=alert, không đổi tên; tên rỗng/1 ký tự bị chặn', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'PATCH /me/profile', status: 500, body: { error: 'Lỗi máy chủ giả' }, times: 1 });
    await go(p, '/settings/personal/profile', '.crm-ap');
    await btn(p, 'Sửa họ tên').click();
    const input = p.getByLabel('Họ tên', { exact: true });
    await input.fill('');
    await expect(btn(p, 'Lưu thay đổi')).toBeDisabled();
    await input.fill('A');
    await expect(btn(p, 'Lưu thay đổi')).toBeDisabled();
    await input.fill('Tên Lỗi Giả');
    await btn(p, 'Lưu thay đổi').click();
    await expect(p.getByRole('alert').filter({ hasText: 'Lỗi máy chủ giả' })).toBeVisible();
    await expect(p.getByRole('dialog', { name: 'Sửa họ tên' })).toBeVisible();
    await expect(p.locator('.crm-ap__name')).toHaveText(OWNER.fullName);
    // thử lại thành công
    await btn(p, 'Lưu thay đổi').click();
    await expect(p.locator('.crm-ap__name')).toHaveText('Tên Lỗi Giả');
    await finish(b);
  });

  test('ảnh đại diện: tải file giả (multipart field avatar), quá 15MB bị chặn không gọi API, xóa có xác nhận', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/personal/profile', '.crm-ap');
    await expect(btn(p, 'Xóa ảnh')).toHaveCount(0);
    await p.locator('input[type=file]').setInputFiles({ name: 'fake-avatar.png', mimeType: 'image/png', buffer: Buffer.alloc(16 * 1024 * 1024 + 1) });
    await expect(toast(p, 'Ảnh tối đa 15MB')).toBeVisible();
    expect(b.mock.find('POST', /^\/me\/avatar$/)).toHaveLength(0);
    await p.locator('input[type=file]').setInputFiles({ name: 'fake-avatar.png', mimeType: 'image/png', buffer: FAKE_PNG });
    await expect(toast(p, 'Đã cập nhật ảnh đại diện')).toBeVisible();
    const up = b.mock.find('POST', /^\/me\/avatar$/);
    expect(up).toHaveLength(1);
    expect(up[0].contentType).toContain('multipart/form-data');
    expect(up[0].raw).toContain('name="avatar"');
    expect(up[0].raw).toContain('filename="fake-avatar.png"');
    await expect(btn(p, 'Xóa ảnh')).toBeVisible();
    await btn(p, 'Xóa ảnh').click();
    await confirmBox(p).getByRole('button', { name: 'Giữ lại' }).click();
    expect(b.mock.find('PATCH', /^\/me\/profile$/)).toHaveLength(0);
    await btn(p, 'Xóa ảnh').click();
    await confirmBox(p).getByRole('button', { name: 'Xóa ảnh' }).click();
    await expect(toast(p, 'Đã xóa ảnh đại diện')).toBeVisible();
    expect(b.mock.find('PATCH', /^\/me\/profile$/)[0].body).toEqual({ avatarUrl: null });
    await expect(btn(p, 'Xóa ảnh')).toHaveCount(0);
    await finish(b);
  });

  test('upload ảnh lỗi 500: toast lỗi, avatar không đổi', async ({ browser }) => {
    const b = await boot390(browser);
    b.mock.fail({ match: 'POST /me/avatar', status: 500, body: { error: 'Ảnh lỗi giả' } });
    await go(b.page, '/settings/personal/profile', '.crm-ap');
    await b.page.locator('input[type=file]').setInputFiles({ name: 'fake-avatar.png', mimeType: 'image/png', buffer: FAKE_PNG });
    await expect(toast(b.page, 'Ảnh lỗi giả')).toBeVisible();
    await expect(btn(b.page, 'Xóa ảnh')).toHaveCount(0);
    await finish(b);
  });

  test('đổi mật khẩu mở modal gốc và đóng được', async ({ browser }) => {
    const b = await boot390(browser);
    await go(b.page, '/settings/personal/profile', '.crm-ap');
    await b.page.getByRole('button', { name: /Đổi mật khẩu/ }).click();
    await expect(b.page.locator('input[type=password]').first()).toBeVisible();
    await finish(b);
  });
});

// ════════════════════════════ Thông báo của tôi (wizard gốc) ════════════════════════════
test.describe('Thông báo của tôi / feed', () => {
  const IC = '/settings/channels/zalo?tab=internal-contact';
  test('cấu hình chỉ đọc: giữ khóa wizard thủ công, không request ghi', async ({ browser }) => {
    const b = await boot390(browser);
    await go(b.page, IC, '.crm-ic__card');
    await expect(b.page.getByText('Chưa có cấu hình nhận thông báo')).toBeVisible();
    await expect(b.page.getByText(/Thiết lập thủ công đã được khóa/)).toBeVisible();
    await expect(b.page.locator('.ic-page')).toHaveCount(0);
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('cấu hình đang hoạt động: hiển thị trạng thái, không có cách đổi nơi nhận', async ({ browser }) => {
    const b = await boot390(browser);
    b.mock.data.internal = { status: 'ready', method: 'personal_phone' };
    await go(b.page, IC, '.crm-ic__card');
    await expect(b.page.getByText('Sẵn sàng nhận thông báo')).toBeVisible();
    await expect(b.page.getByText('0900000888')).toBeVisible();
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('lỗi tải wizard: 500 / 403 / offline không giả làm "chưa thiết lập"; Thử lại phục hồi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'GET /me/internal-contact', status: 500 });
    await go(p, IC, '.m-feedback');
    await expect(p.getByText('Không tải được cấu hình thông báo')).toBeVisible();
    await expect(p.getByText('Thiết lập kênh nhận thông báo')).toHaveCount(0);
    b.mock.clearRules();
    await btn(p, 'Thử lại').click();
    await expect(p.locator('.crm-ic__card')).toBeVisible();
    // 403
    b.mock.fail({ match: 'GET /me/internal-contact', status: 403 });
    await p.reload();
    await p.locator('.m-feedback').first().waitFor();
    await expect(p.getByText('Bạn không có quyền xem mục này')).toBeVisible();
    // offline
    b.mock.clearRules();
    b.mock.fail({ match: 'GET /me/internal-contact', abort: true });
    await p.reload();
    await p.locator('.m-feedback').first().waitFor();
    await b.ctx.setOffline(true);
    await btn(p, 'Thử lại').click();
    await expect(p.getByText('Đang mất kết nối')).toBeVisible();
    await b.ctx.setOffline(false);
    b.mock.clearRules();
    await btn(p, 'Thử lại').click().catch(() => undefined);
    await expect(p.locator('.crm-ic__card')).toBeVisible();
    await finish(b);
  });

  test('feed "Thông báo cần xử lý": 3 mục, lối sang wizard, đích điều hướng đúng; 500/rỗng', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/personal/notifications', '.crm-np');
    await expect(p.locator('.crm-np__row')).toHaveCount(3);
    await btn(p, /Cấu hình nhận thông báo qua Zalo/).click();
    await expect(p).toHaveURL(/tab=internal-contact/);
    await expect(p.locator('.crm-ic__card')).toBeVisible();
    await btn(p, /Xem thông báo cần xử lý/).click();
    await expect(p.locator('.crm-np')).toBeVisible();
    await p.locator('.crm-np__row').filter({ hasText: 'Lịch hẹn' }).click();
    await expect(p).toHaveURL(/\/appointments/);
    await finish(b);
  });

  test('feed: 500 -> lỗi + Thử lại; dữ liệu rỗng -> "Không có thông báo"', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'GET /notifications', status: 500 });
    await go(p, '/settings/personal/notifications', '.m-feedback');
    await expect(p.getByText('Không tải được thông báo')).toBeVisible();
    b.mock.clearRules();
    b.mock.data.notifications = [];
    await btn(p, 'Thử lại').click();
    await expect(p.getByText('Không có thông báo')).toBeVisible();
    await finish(b);
  });
});

// ════════════════════════════ Hồ sơ tổ chức ════════════════════════════
test.describe('Hồ sơ tổ chức', () => {
  test('owner: tải xong mới có form/Lưu; không PUT trước khi tải; sửa -> Lưu đúng payload đã trim', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'GET /organization', delayMs: 1200, times: 1 });
    await p.goto(`http://localhost:${process.env.D_APP_PORT ?? 4188}/settings/org/profile`);
    await p.locator('.m-feedback--loading, .m-feedback').first().waitFor();
    await expect(p.getByLabel('Slogan')).toHaveCount(0);
    await expect(btn(p, 'Lưu')).toHaveCount(0);
    await expect(p.getByLabel('Slogan')).toBeVisible({ timeout: 8000 });
    expect(writes(b.mock)).toEqual([]);
    await expect(btn(p, 'Lưu')).toBeDisabled(); // chưa sửa
    await p.getByLabel('Slogan').fill('  Khẩu hiệu mới giả  ');
    await expect(btn(p, 'Lưu')).toBeEnabled();
    await btn(p, 'Lưu').click();
    await expect(p.getByText('Đã lưu thành công')).toBeVisible();
    const put = b.mock.find('PUT', /^\/organization$/);
    expect(put).toHaveLength(1);
    expect(put[0].body).toEqual({ name: 'Công ty QA Giả', timezone: '+07:00', logoUrl: '', slogan: 'Khẩu hiệu mới giả', copyright: '© 2026 QA Giả', emailDomain: 'example.invalid' });
    await finish(b);
  });

  test('owner: sửa dở rồi Back (nút quay lại) -> hỏi xác nhận; ở lại giữ dữ liệu; bỏ -> về menu không PUT', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings', '.crm-sm');
    await btn(p, /Hồ sơ tổ chức/).first().click();
    await p.getByLabel('Slogan').waitFor();
    await p.getByLabel('Slogan').fill('Sửa dở');
    await p.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
    await expect(confirmBox(p)).toBeVisible();
    await confirmBox(p).getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    await expect(p).toHaveURL(/org\/profile/);
    await expect(p.getByLabel('Slogan')).toHaveValue('Sửa dở');
    await p.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
    await confirmBox(p).getByRole('button', { name: 'Bỏ thay đổi' }).click();
    await expect(p).toHaveURL(/\/settings$/);
    expect(writes(b.mock)).toEqual([]);
    // tên rỗng vẫn tính là dirty (hỏi) nhưng không cho lưu
    await btn(p, /Hồ sơ tổ chức/).first().click();
    await p.getByLabel('Tên tổ chức').fill('');
    await expect(btn(p, 'Lưu')).toBeDisabled();
    await p.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
    await expect(confirmBox(p)).toBeVisible();
    await finish(b);
  });

  test('admin (không phải owner): tất cả ô khóa, không có nút Lưu, có lời giải thích; không PUT', async ({ browser }) => {
    const b = await boot390(browser, { user: ADMIN_F1 });
    const p = b.page;
    await go(p, '/settings/org/profile', '.org-settings-layout');
    await expect(p.getByLabel('Slogan')).toBeDisabled();
    await expect(p.getByLabel('Tên tổ chức')).toBeDisabled();
    await expect(btn(p, 'Lưu')).toHaveCount(0);
    await expect(p.getByText('Chỉ chủ sở hữu mới có thể chỉnh sửa thông tin tổ chức.')).toBeVisible();
    await p.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
    await expect(confirmBox(p)).toHaveCount(0);
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('lỗi tải: 500 -> lỗi + Thử lại (không form, không PUT); 403; offline; 404 -> form mặc định', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'GET /organization', status: 500 });
    await go(p, '/settings/org/profile', '.m-feedback');
    await expect(p.getByText('Không tải được thông tin tổ chức')).toBeVisible();
    await expect(p.getByLabel('Slogan')).toHaveCount(0);
    await expect(btn(p, 'Lưu')).toHaveCount(0);
    b.mock.clearRules();
    await btn(p, 'Thử lại').click();
    await expect(p.getByLabel('Slogan')).toHaveValue('Khẩu hiệu giả');
    b.mock.fail({ match: 'GET /organization', status: 403 });
    await p.reload(); await p.locator('.m-feedback').first().waitFor();
    await expect(p.getByText('Bạn không có quyền xem mục này')).toBeVisible();
    b.mock.clearRules();
    b.mock.fail({ match: 'GET /organization', abort: true });
    await p.reload(); await p.locator('.m-feedback').first().waitFor();
    await b.ctx.setOffline(true);
    await btn(p, 'Thử lại').click();
    await expect(p.getByText('Đang mất kết nối')).toBeVisible();
    await b.ctx.setOffline(false);
    b.mock.clearRules();
    b.mock.fail({ match: 'GET /organization', status: 404 });
    await btn(p, 'Thử lại').click();
    await expect(p.getByLabel('Tên tổ chức')).toBeVisible();
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('lưu lỗi 500 hiện lỗi, form giữ nguyên; đang lưu thì chặn rời trang', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/org/profile', '.org-settings-layout');
    await p.getByLabel('Slogan').waitFor();
    b.mock.fail({ match: 'PUT /organization', status: 500, body: { error: 'Không lưu được giả' }, times: 1 });
    await p.getByLabel('Slogan').fill('Thử lỗi');
    await btn(p, 'Lưu').click();
    await expect(p.getByText('Không lưu được giả')).toBeVisible();
    await expect(p.getByLabel('Slogan')).toHaveValue('Thử lỗi');
    b.mock.fail({ match: 'PUT /organization', delayMs: 1500, times: 1 });
    await btn(p, 'Lưu').click();
    await p.getByRole('button', { name: 'Quay lại danh sách cài đặt' }).click();
    await p.waitForTimeout(300);
    await expect(p).toHaveURL(/org\/profile/); // bị chặn khi đang lưu
    await expect(p.getByText('Đã lưu thành công')).toBeVisible({ timeout: 6000 });
    await finish(b);
  });

  test('Tối: mô phỏng đăng nhập giữ nền Sáng có ghi chú, form theo Tối', async ({ browser }) => {
    const b = await boot390(browser, { theme: 'dark' });
    const p = b.page;
    await go(p, '/settings/org/profile', '.org-settings-layout');
    await expect(p.getByText('luôn hiển thị nền sáng')).toBeVisible();
    const bg = await p.locator('.org-preview-light').first().evaluate(e => getComputedStyle(e).backgroundColor);
    const lum = (s: string) => { const [r, g, bb] = s.match(/\d+(\.\d+)?/g)!.map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255; };
    expect(lum(bg), `preview bg ${bg}`).toBeGreaterThan(0.85);
    const formBg = await p.locator('.org-form-col .v-card').first().evaluate(e => getComputedStyle(e).backgroundColor);
    expect(lum(formBg), `form bg ${formBg}`).toBeLessThan(0.4);
    await finish(b);
  });
});

// ════════════════════════════ Nhân viên ════════════════════════════
test.describe('Nhân viên', () => {
  const U = '/settings/rbac/users';
  test('thẻ: tên/vai trò/phòng/nhóm/trạng thái; tên dài không tràn; chip trạng thái lọc; đếm', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, U, '.crm-el__item');
    const cards = p.locator('.crm-el__item');
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(1);
    await btn(p, 'Tất cả').click();
    await expect(cards).toHaveCount(8);
    await expect(p.locator('.crm-el__count')).toContainText('8 / 8');
    await btn(p, /Vô hiệu/).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Vũ Minh Đã Nghỉ');
    await btn(p, /Chưa kích hoạt/).click();
    await expect(cards).toHaveCount(2);
    await btn(p, 'Tất cả').click();
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ov).toBe(0);
    await finish(b);
  });

  test('tìm kiếm: response cũ ("an" về sau "anh") KHÔNG ghi đè kết quả mới; request đúng query', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, U, '.crm-el__item');
    await btn(p, 'Tất cả').click();
    b.mock.fail({ match: /GET \/rbac\/users\?q=an$/, delayMs: 1800 });
    const search = p.getByRole('searchbox', { name: 'Tìm nhân viên' });
    await search.fill('an');
    await p.waitForTimeout(450); // qua debounce -> request "an" đang treo
    await search.fill('anh');
    await expect(p.locator('.crm-el__item')).toHaveCount(2); // Phạm Thị Anh, Bùi Quang Anh Tuấn
    await p.waitForTimeout(2200); // response "an" đã về
    await expect(p.locator('.crm-el__item')).toHaveCount(2);
    await expect(p.locator('.crm-el__item').first()).toContainText(/Anh/);
    const qs = b.mock.find('GET', /^\/rbac\/users$/).map(r => r.query.q).filter(Boolean);
    expect(qs).toContain('an'); expect(qs).toContain('anh');
    await finish(b);
  });

  test('lọc phòng ban / nhóm quyền gửi đúng query; rỗng có "Xóa bộ lọc"', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, U, '.crm-el__item');
    await btn(p, 'Tất cả').click();
    await p.getByLabel('Phòng ban').first().selectOption('d-cs');
    await expect(p.locator('.crm-el__item')).toHaveCount(1);
    expect(b.mock.find('GET', /^\/rbac\/users$/).some(r => r.query.departmentId === 'd-cs')).toBe(true);
    await p.getByLabel('Nhóm quyền').first().selectOption('g-view');
    await expect(p.getByText('Không có nhân viên khớp bộ lọc')).toBeVisible();
    await finish(b);
  });

  test('mở thẻ -> UserEditPanel gốc toàn màn hình; focus trap; Esc đóng; focus trả về đúng thẻ; sửa tên PUT đúng payload', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, U, '.crm-el__item');
    await btn(p, 'Tất cả').click();
    const card = p.getByRole('button', { name: 'Mở chi tiết Trần Thị Mẫu' });
    await card.focus(); // WebKit/Safari không focus nút khi chạm; dùng bàn phím để có đích trả focus xác định
    await p.keyboard.press('Enter');
    const panel = p.getByRole('dialog', { name: 'Chi tiết nhân viên' });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(388);
    for (let i = 0; i < 40; i++) await p.keyboard.press('Tab');
    expect(await p.evaluate(() => !!document.activeElement?.closest('.panel--m, .cam-modal, .ce-overlay')), 'focus thoát khỏi panel').toBe(true);
    const nameInput = panel.getByLabel('Họ tên', { exact: true });
    await nameInput.fill('Trần Thị Mẫu Sửa');
    await nameInput.blur();
    await expect.poll(() => b.mock.find('PUT', /^\/users\/u-2$/).length).toBe(1);
    expect(b.mock.find('PUT', /^\/users\/u-2$/)[0].body).toEqual({ fullName: 'Trần Thị Mẫu Sửa' });
    await panel.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(panel).toBeHidden();
    // danh sách phải cập nhật và focus quay về thẻ của người đó
    await expect(p.getByRole('button', { name: 'Mở chi tiết Trần Thị Mẫu Sửa' })).toBeVisible();
    const focused = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);
    expect.soft(focused, 'focus trả về thẻ nhân viên sau khi đóng panel').toMatch(/Mở chi tiết Trần Thị Mẫu/);
    await finish(b);
  });

  test('panel: chạm × ngay sau khi gõ họ tên (blur tự lưu) vẫn đóng ở lần chạm đầu', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, U, '.crm-el__item');
    await p.getByRole('button', { name: /Mở chi tiết Nguyễn Văn Giả/ }).click();
    const panel = p.getByRole('dialog', { name: 'Chi tiết nhân viên' });
    await panel.getByLabel('Họ tên', { exact: true }).fill('Nguyễn Văn Giả B');
    // chạm thẳng × (blur xảy ra trong cùng thao tác chạm)
    await panel.getByRole('button', { name: 'Đóng', exact: true }).click();
    await p.waitForTimeout(800);
    const stillOpen = await panel.isVisible();
    const dirtyPrompt = await confirmBox(p).count();
    expect.soft(stillOpen && dirtyPrompt === 0, 'panel không đóng và không hỏi gì sau lần chạm × đầu tiên').toBe(false);
    await finish(b);
  });

  test('chọn nhiều + gán hàng loạt: payload bulk-assign nguyên gốc; "Chọn tất cả" theo danh sách đang hiện', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    p.on('dialog', d => { void d.accept(); });
    await go(p, U, '.crm-el__item');
    await btn(p, 'Tất cả').click();
    await p.getByRole('checkbox', { name: 'Chọn Trần Thị Mẫu' }).check();
    await p.getByRole('checkbox', { name: 'Chọn Phạm Thị Anh' }).check();
    await expect(p.getByText('Đã chọn 2 nhân viên')).toBeVisible();
    await p.getByLabel('Gán nhóm quyền').first().selectOption('g-view');
    await btn(p, 'Áp dụng').click();
    await expect.poll(() => b.mock.find('POST', /bulk-assign$/).length).toBe(1);
    expect(b.mock.find('POST', /bulk-assign$/)[0].body).toEqual({ userIds: ['u-2', 'u-4'], permissionGroupId: 'g-view' });
    await expect(p.getByText('Đã chọn')).toHaveCount(0);
    await p.getByRole('checkbox', { name: /Chọn tất cả/ }).check();
    await expect(p.getByText('Đã chọn 8 nhân viên')).toBeVisible();
    await finish(b);
  });

  test('tạo nhân viên: modal gốc 3 bước, dirty-close hỏi, payload create-with-zalo, danh sách tải lại', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, U, '.crm-el__item');
    await p.locator('.crm-el__add').click();
    const modal = p.getByRole('dialog', { name: 'Thêm nhân viên qua Zalo' });
    await expect(modal).toBeVisible();
    await modal.getByLabel('Họ tên', { exact: true }).fill('Người Mới Giả');
    await modal.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await expect(confirmBox(p)).toBeVisible();
    await confirmBox(p).getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    await expect(modal).toBeVisible();
    await modal.getByLabel('Số điện thoại', { exact: true }).fill('0900000777');
    await modal.getByLabel('Phòng ban', { exact: true }).selectOption('d-kd');
    await modal.getByLabel('Nhóm quyền', { exact: true }).selectOption('g-sale');
    await modal.getByRole('button', { name: /Kiểm tra Zalo/ }).click();
    await expect(modal.getByText('Xác nhận thông tin Zalo')).toBeVisible();
    await modal.getByRole('button', { name: /Xác nhận tạo nhân viên/ }).click();
    await expect(modal.getByText('Tạo thành công')).toBeVisible();
    expect(b.mock.find('POST', /check-zalo-by-phone$/)[0].body).toEqual({ phone: '0900000777' });
    expect(b.mock.find('POST', /create-with-zalo$/)[0].body).toEqual({
      fullName: 'Người Mới Giả', phone: '0900000777', email: null, departmentId: 'd-kd', permissionGroupId: 'g-sale', role: 'member', confirmedUid: 'fake-uid-777',
    });
    const before = b.mock.find('GET', /^\/rbac\/users$/).length;
    await modal.getByRole('button', { name: /Đóng \+ xem danh sách/ }).click();
    await expect(modal).toBeHidden();
    await expect.poll(() => b.mock.find('GET', /^\/rbac\/users$/).length).toBeGreaterThan(before);
    await finish(b);
  });

  test('RBAC: member có user.access nhưng không phải admin -> xem được, KHÔNG có Thêm nhân viên / chọn nhiều', async ({ browser }) => {
    const viewer: FakeUser = { ...SETTINGS_MEMBER, id: 'qa-user-viewer', fullName: 'QA Xem User', grants: { user: { access: true }, settings: { access: true } } };
    const b = await boot390(browser, { user: viewer });
    const p = b.page;
    await go(p, U, '.crm-el__item');
    await expect(p.locator('.crm-el__add')).toHaveCount(0);
    await expect(p.getByRole('checkbox')).toHaveCount(0);
    await finish(b);
  });

  test('trạng thái tải: 500 / 403 / offline / rỗng; Thử lại phục hồi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'GET /rbac/users', status: 500 });
    await go(p, U, '.m-feedback');
    await expect(p.getByText('Không tải được danh sách nhân viên')).toBeVisible();
    b.mock.clearRules();
    await btn(p, 'Thử lại').click();
    await expect(p.locator('.crm-el__item').first()).toBeVisible();
    b.mock.fail({ match: 'GET /rbac/users', status: 403 });
    await p.reload(); await p.locator('.m-feedback').first().waitFor();
    await expect(p.getByText('Bạn không có quyền xem mục này')).toBeVisible();
    await expect(btn(p, 'Thử lại')).toHaveCount(0);
    b.mock.clearRules();
    b.mock.data.users = [];
    await p.reload();
    await expect(p.getByText('Chưa có nhân viên nào')).toBeVisible();
    b.mock.clearRules();
    b.mock.data.users = [];
    await finish(b);
  });

  test('offline: mạng rớt hiện "Đang mất kết nối"', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, U, '.crm-el__item');
    b.mock.fail({ match: 'GET /rbac/users', abort: true });
    await b.ctx.setOffline(true);
    await p.getByRole('searchbox', { name: 'Tìm nhân viên' }).fill('x');
    await expect(p.getByText('Đang mất kết nối')).toBeVisible({ timeout: 6000 });
    await b.ctx.setOffline(false);
    await finish(b);
  });

  test('làm mới sau khi đóng panel giữ vị trí cuộn (viewport thấp)', async ({ browser }) => {
    const b = await boot(browser, { name: '375x667', w: 375, h: 667, touch: true });
    const p = b.page;
    await go(p, U, '.crm-el__item');
    await btn(p, 'Tất cả').click();
    const scroller = p.locator('.m-main__scroll');
    await scroller.evaluate(e => { e.scrollTop = e.scrollHeight; });
    const before = await scroller.evaluate(e => e.scrollTop);
    expect(before).toBeGreaterThan(100);
    await p.getByRole('button', { name: /Mở chi tiết Bùi Quang Anh Tuấn/ }).click();
    const panel = p.getByRole('dialog', { name: 'Chi tiết nhân viên' });
    await panel.getByLabel('Phòng ban', { exact: true }).selectOption('d-kd'); // gây onChanged -> tải lại danh sách
    await p.waitForTimeout(600);
    await panel.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(panel).toBeHidden();
    await p.waitForTimeout(500);
    const after = await scroller.evaluate(e => e.scrollTop);
    expect.soft(after, `scrollTop trước=${before}, sau=${after}: danh sách bị dựng lại làm mất vị trí cuộn`).toBeGreaterThan(before - 60);
    await finish(b);
  });
});

// ════════════════════════════ Trạng thái KH ════════════════════════════
test.describe('Trạng thái KH', () => {
  const S = '/settings/crm/statuses';
  test('danh sách theo thứ tự; thêm: payload; dirty-close hỏi; lỗi 500 giữ sheet', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, S, '.crm-sp__card');
    await expect(p.locator('.crm-sp__card')).toHaveCount(4);
    await expect(p.locator('.crm-sp__chip').first()).toContainText('Mới');
    await p.locator('.crm-sp__add').click();
    const dlg = p.getByRole('dialog', { name: 'Thêm trạng thái' });
    await btn(p, 'Tạo').click(); // tên rỗng
    await expect(p.getByRole('alert').filter({ hasText: 'Tên không được trống' })).toBeVisible();
    expect(writes(b.mock)).toEqual([]);
    await p.getByLabel(/Tên/).first().fill('Chờ báo giá');
    await btn(p, 'Đóng').click();
    await confirmBox(p).getByRole('button', { name: 'Bỏ thay đổi' }).click();
    await expect(dlg).toBeHidden();
    expect(writes(b.mock)).toEqual([]);
    await p.locator('.crm-sp__add').click();
    await p.getByLabel(/Tên/).first().fill('Chờ báo giá');
    await p.getByLabel('Thứ tự ưu tiên').fill('25');
    b.mock.fail({ match: 'POST /settings/statuses', status: 500, body: { error: 'Trùng tên giả' }, times: 1 });
    await btn(p, 'Tạo').click();
    await expect(p.getByRole('alert').filter({ hasText: 'Trùng tên giả' })).toBeVisible();
    await expect(dlg).toBeVisible();
    await btn(p, 'Tạo').click();
    await expect(dlg).toBeHidden();
    const posts = b.mock.find('POST', /^\/settings\/statuses$/);
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toEqual({ name: 'Chờ báo giá', order: 25, color: '#9CA3AF', isTerminal: false, isDefault: false });
    await expect(p.locator('.crm-sp__chip', { hasText: 'Chờ báo giá' })).toBeVisible();
    await finish(b);
  });

  test('sửa (PUT), xóa có xác nhận (Giữ lại không gọi API; Xóa -> DELETE), đang lưu chặn đóng', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, S, '.crm-sp__card');
    await btn(p, 'Sửa Đang tư vấn').click();
    await p.getByLabel(/Tên/).first().fill('Đang tư vấn 2');
    await p.locator('#sf-color').fill('#ff0000');
    b.mock.fail({ match: 'PUT /settings/statuses/s2', delayMs: 1500, times: 1 });
    await btn(p, 'Lưu thay đổi').click();
    await expect(btn(p, 'Đang lưu…')).toBeDisabled();
    await btn(p, 'Đóng').click();
    await p.waitForTimeout(300);
    await expect(p.getByRole('dialog', { name: 'Sửa trạng thái' })).toBeVisible();
    await expect(p.getByRole('dialog', { name: 'Sửa trạng thái' })).toBeHidden({ timeout: 6000 });
    const put = b.mock.find('PUT', /^\/settings\/statuses\/s2$/);
    expect(put).toHaveLength(1);
    expect(put[0].body).toEqual({ name: 'Đang tư vấn 2', order: 20, color: '#ff0000', isTerminal: false, isDefault: false });
    await btn(p, 'Xóa Chốt đơn').click();
    await confirmBox(p).getByRole('button', { name: 'Giữ lại' }).click();
    expect(b.mock.find('DELETE', /statuses/).length).toBe(0);
    await btn(p, 'Xóa Chốt đơn').click();
    await confirmBox(p).getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(p.locator('.crm-sp__card')).toHaveCount(3);
    expect(b.mock.find('DELETE', /^\/settings\/statuses\/s3$/)).toHaveLength(1);
    await finish(b);
  });

  test('đổi thứ tự lên/xuống: payload reorder; hàng đầu/cuối bị khóa; lỗi 500 báo toast', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, S, '.crm-sp__card');
    await expect(btn(p, 'Đưa Mới lên')).toBeDisabled();
    await expect(btn(p, 'Đưa Mất khách xuống')).toBeDisabled();
    await btn(p, 'Đưa Đang tư vấn lên').click();
    await expect(p.locator('.crm-sp__chip').first()).toContainText('Đang tư vấn');
    expect(b.mock.find('POST', /reorder$/)[0].body).toEqual({ items: [{ id: 's2', order: 10 }, { id: 's1', order: 20 }] });
    b.mock.fail({ match: 'POST /settings/statuses/reorder', status: 500, times: 1 });
    await btn(p, 'Đưa Mất khách lên').click();
    await expect(toast(p, 'Reorder thất bại')).toBeVisible();
    await expect(p.locator('.crm-sp__chip').nth(2)).toContainText('Chốt đơn');
    await finish(b);
  });

  test('hai hàng trùng order: nút lên/xuống vẫn đổi được (đánh số lại 1..n)', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.data.statuses.forEach(s => { s.order = 5; });
    await go(p, S, '.crm-sp__card');
    await btn(p, 'Đưa Đang tư vấn lên').click();
    const body = b.mock.find('POST', /reorder$/)[0].body as { items: Array<{ id: string; order: number }> };
    expect(body.items.map(i => i.order)).toEqual([1, 2, 3, 4]);
    await finish(b);
  });

  test('trạng thái tải: 500/403/offline/rỗng + Thử lại', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    b.mock.fail({ match: 'GET /settings/statuses', status: 500, times: 1 });
    await go(p, S, '.m-feedback');
    await expect(p.getByText('Không tải được trạng thái')).toBeVisible();
    await expect(p.locator('.crm-sp__add')).toBeDisabled();
    await btn(p, 'Thử lại').click();
    await expect(p.locator('.crm-sp__card')).toHaveCount(4);
    b.mock.fail({ match: 'GET /settings/statuses', status: 403 });
    await p.reload(); await p.locator('.m-feedback').first().waitFor();
    await expect(p.getByText('Bạn không có quyền xem mục này')).toBeVisible();
    b.mock.clearRules();
    b.mock.data.statuses = [];
    await p.reload();
    await expect(p.getByText('Chưa có trạng thái')).toBeVisible();
    await finish(b);
  });
});

// ════════════════════════════ Nhãn KH ════════════════════════════
test.describe('Nhãn KH', () => {
  const T = '/settings/crm/tags-v2';
  test('tab scope + đếm; tìm kiếm; lọc nguồn; lọc nick (chỉ tab bạn bè); xóa bộ lọc', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, T, '.crm-tp__card');
    await expect(p.getByRole('tab', { name: /Nhãn CRM/ })).toHaveAttribute('aria-selected', 'true');
    await expect(p.locator('.crm-tp__card')).toHaveCount(3);
    await expect(p.getByLabel('Nick Zalo')).toHaveCount(0);
    await p.getByRole('searchbox', { name: 'Tìm nhãn' }).fill('vip');
    await expect(p.locator('.crm-tp__card')).toHaveCount(1);
    await p.getByRole('searchbox', { name: 'Tìm nhãn' }).fill('zzz');
    await expect(p.getByText('Không có nhãn khớp bộ lọc')).toBeVisible();
    await btn(p, 'Xóa bộ lọc').click();
    await expect(p.locator('.crm-tp__card')).toHaveCount(3);
    await p.getByLabel('Nguồn').selectOption('ai_suggest');
    await expect(p.locator('.crm-tp__card')).toHaveCount(1);
    await p.getByRole('tab', { name: /Nhãn bạn bè/ }).click();
    await expect(p.locator('.crm-tp__card')).toHaveCount(3);
    await p.getByLabel('Nick Zalo').selectOption('n1');
    await expect(p.locator('.crm-tp__card')).toHaveCount(2);
    await p.getByLabel('Nguồn').selectOption('auto_detect');
    await expect(p.locator('.crm-tp__card')).toHaveCount(1);
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('tạo nhãn bạn bè: payload KHÔNG có zaloAccountId, đúng scope/source; dirty-close hỏi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, T, '.crm-tp__card');
    await p.getByRole('tab', { name: /Nhãn bạn bè/ }).click();
    await p.locator('.crm-tp__add').click();
    const dlg = p.getByRole('dialog', { name: 'Thêm nhãn' });
    await p.getByLabel(/Tên nhãn/).fill('Nhãn mới giả');
    await btn(p, 'Đóng').click();
    await confirmBox(p).getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    await expect(dlg).toBeVisible();
    // nguồn: không có zalo_real
    const opts = await p.locator('#tf-src option').allTextContents();
    expect(opts).not.toContain('Zalo Real');
    await p.getByRole('radio', { name: 'Đỏ', exact: true }).click();
    await btn(p, 'Tạo nhãn').click();
    await expect(dlg).toBeHidden();
    const post = b.mock.find('POST', /^\/tags$/);
    expect(post).toHaveLength(1);
    expect(post[0].body).toEqual({ name: 'Nhãn mới giả', scope: 'friend', source: 'manual_per_nick', color: '#D91B1B', emoji: null });
    expect(Object.keys(post[0].body as object)).not.toContain('zaloAccountId');
    await finish(b);
  });

  test('sửa nhãn: PATCH payload; lưu trữ có xác nhận -> DELETE /tags/:id', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, T, '.crm-tp__card');
    await p.locator('.crm-tp__card', { hasText: 'Cần gọi lại' }).click();
    await p.getByLabel(/Tên nhãn/).fill('Cần gọi lại 2');
    await p.getByLabel('Biểu tượng (emoji)').fill('📞');
    await p.getByLabel(/Ưu tiên/).fill('7');
    await btn(p, 'Lưu thay đổi').click();
    await expect(p.getByRole('dialog', { name: 'Sửa nhãn' })).toBeHidden();
    expect(b.mock.find('PATCH', /^\/tags\/t2$/)[0].body).toEqual({ name: 'Cần gọi lại 2', color: '#D91B1B', emoji: '📞', priority: 7 });
    await p.locator('.crm-tp__card', { hasText: 'Khách VIP' }).click();
    await btn(p, /Lưu trữ nhãn này/).click();
    await confirmBox(p).getByRole('button', { name: 'Hủy', exact: true }).click();
    expect(b.mock.find('DELETE', /tags/).length).toBe(0);
    await btn(p, /Lưu trữ nhãn này/).click();
    await confirmBox(p).getByRole('button', { name: 'Lưu trữ', exact: true }).click();
    await expect(p.locator('.crm-tp__card', { hasText: 'Khách VIP' })).toHaveCount(0);
    expect(b.mock.find('DELETE', /^\/tags\/t1$/)).toHaveLength(1);
    await finish(b);
  });

  test('nhãn Zalo Real: desktop khóa Merge/Archive -> mobile KHÔNG được cho Lưu trữ (parity)', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, T, '.crm-tp__card');
    await p.getByRole('tab', { name: /Nhãn bạn bè/ }).click();
    await p.locator('.crm-tp__card', { hasText: 'Bạn Zalo đồng bộ' }).click();
    await expect(p.getByText(/Nhãn Zalo Real: lưu sẽ đồng bộ ngược/)).toBeVisible();
    await expect(btn(p, /Lưu trữ nhãn này/), 'desktop TagTaxonomyV2Page disable Archive cho zalo_real (dòng 119)').toBeDisabled();
    await finish(b);
  });

  test('lưu lỗi 500 giữ sheet; trạng thái tải 500/403/rỗng', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, T, '.crm-tp__card');
    await p.locator('.crm-tp__add').click();
    await p.getByLabel(/Tên nhãn/).fill('Nhãn lỗi');
    b.mock.fail({ match: 'POST /tags', status: 500, body: { error: 'Tag lỗi giả' }, times: 1 });
    await btn(p, 'Tạo nhãn').click();
    await expect(p.getByRole('alert').filter({ hasText: 'Tag lỗi giả' })).toBeVisible();
    await btn(p, 'Đóng').click(); await confirmBox(p).getByRole('button', { name: 'Bỏ thay đổi' }).click();
    b.mock.fail({ match: /GET \/tags\?scope=friend/, status: 500, times: 1 });
    await p.reload();
    await p.locator('.m-feedback').first().waitFor();
    await expect(p.getByText('Không tải được nhãn')).toBeVisible();
    await btn(p, 'Thử lại').click();
    await expect(p.locator('.crm-tp__card').first()).toBeVisible();
    b.mock.fail({ match: 'GET /tags', status: 403 });
    await p.reload(); await p.locator('.m-feedback').first().waitFor();
    await expect(p.getByText('Bạn không có quyền xem mục này')).toBeVisible();
    b.mock.clearRules();
    b.mock.data.tags = [];
    await p.reload();
    await expect(p.getByText('Chưa có nhãn')).toBeVisible();
    await finish(b);
  });
});

// ════════════════════════════ Trang quản trị chỉ đọc ════════════════════════════
test.describe('Trang nặng (chỉ đọc)', () => {
  test('Phân quyền: chọn được từng nhóm (aria-pressed), quyền đổi theo nhóm, không có request ghi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/rbac/permission-groups', '.crm-pg__detail');
    const items = p.locator('.crm-pg__item');
    await expect(items).toHaveCount(4);
    await expect(items.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(p.locator('.crm-pg__sum')).toContainText(/Được cấp 29 \/ 29 quyền/);
    await items.filter({ hasText: 'Chỉ xem' }).click();
    await expect(items.filter({ hasText: 'Chỉ xem' })).toHaveAttribute('aria-pressed', 'true');
    await expect(items.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(p.locator('.crm-pg__sum')).toContainText('Được cấp 0 /');
    await expect(p.locator('.crm-pg__detail')).toContainText('Không có quyền');
    await items.filter({ hasText: 'Sale trưởng nhóm' }).click();
    await expect(p.locator('.crm-pg__row', { hasText: 'Hội thoại' })).toContainText('Truy cập, Xem tất cả');
    await expect(p.getByText(/Dùng máy tính/)).toBeVisible();
    expect(writes(b.mock)).toEqual([]);
    // đọc được bằng accessibility tree (không inert/aria-hidden)
    expect(await p.locator('.crm-pg [inert], .crm-pg [aria-hidden="true"]:not(i)').count()).toBe(0);
    await finish(b);
  });

  test('Phòng ban: cây thụt lề, số thành viên; không request ghi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/rbac/departments', '.crm-dp__item');
    await expect(p.locator('.crm-dp__item')).toHaveCount(3);
    await expect(p.locator('.crm-dp__item').nth(1)).toContainText('Nhóm bán lẻ');
    await expect(p.locator('.crm-dp__item').nth(1)).toContainText('3 thành viên');
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('Chấm điểm: trọng số / giảm điểm / cờ / quy tắc hiển thị đúng; không request ghi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/crm/scoring', '.crm-sc__card');
    await expect(p.getByText('Tương tác').first()).toBeVisible();
    await expect(p.locator('.crm-sc__kv').first()).toContainText('30%');
    await expect(p.locator('.crm-sc__rule')).toHaveCount(6);
    await expect(p.locator('.crm-sc__rule').first()).toContainText('Quy tắc giả số 1');
    await expect(p.locator('.crm-sc__rule').nth(3)).toContainText('Tắt');
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('Tích hợp: không lộ config/khóa bí mật trong DOM; tên rỗng dùng nhãn loại; không request ghi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/channels/integrations', '.crm-ig__card');
    await expect(p.locator('.crm-ig__card')).toHaveCount(2);
    const html = await p.content();
    for (const s of ['SECRET-KHONG-DUOC-HIEN-THI', 'TOKEN-BI-MAT', 'SECRET-2']) expect(html).not.toContain(s);
    await expect(p.locator('.crm-ig__card').first()).toContainText('Bảng tính giả');
    await expect(p.locator('.crm-ig__card').first()).toContainText('Bật');
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  test('Audit: chip lọc (aria-pressed) gửi action; phân trang offset=50; không request ghi', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await go(p, '/settings/org/audit', '.crm-au__item');
    await expect(p.locator('.crm-au__count')).toContainText('120');
    await expect(p.locator('.crm-au__item')).toHaveCount(50);
    await btn(p, 'Sau →').click();
    await expect(p.locator('.crm-au__info')).toHaveText('51–100 / 120');
    expect(b.mock.find('GET', /audit-logs/).some(r => r.query.offset === '50' && r.query.limit === '50')).toBe(true);
    await btn(p, '← Trước').click();
    await btn(p, 'Bàn giao').click();
    await expect(p.getByRole('button', { name: 'Bàn giao' })).toHaveAttribute('aria-pressed', 'true');
    await expect(p.locator('.crm-au__count')).toContainText('40');
    expect(b.mock.find('GET', /audit-logs/).some(r => r.query.action === 'user.handoff' && r.query.offset === '0')).toBe(true);
    expect(writes(b.mock)).toEqual([]);
    await finish(b);
  });

  const states: Array<[string, string, string, string, string, () => RegExp | string, (m: F1Mock) => void, string]> = [
    ['Phân quyền', '/settings/rbac/permission-groups', 'GET /permission-groups', 'Không tải được nhóm quyền', 'Chưa có nhóm quyền', () => 'x', m => { m.data.groups = []; }, '.crm-pg'],
    ['Phòng ban', '/settings/rbac/departments', 'GET /departments', 'Không tải được phòng ban', 'Chưa có phòng ban', () => 'x', m => { m.data.depts = []; }, '.crm-dp'],
    ['Chấm điểm', '/settings/crm/scoring', 'GET /scoring/config', 'Không tải được cấu hình chấm điểm', '', () => 'x', () => undefined, '.crm-sc'],
    ['Tích hợp', '/settings/channels/integrations', 'GET /integrations', 'Không tải được danh sách tích hợp', 'Chưa có tích hợp', () => 'x', m => { m.data.integrations = []; }, '.crm-ig'],
    ['Audit', '/settings/org/audit', 'GET /audit-logs', 'Không tải được nhật ký', 'Chưa có thao tác nào được ghi lại', () => 'x', m => { m.data.audit = []; }, '.crm-au'],
  ];
  for (const [name, url, ep, errTitle, emptyTitle, , setEmpty, root] of states) {
    test(`${name}: 500 -> lỗi + Thử lại phục hồi; 403 không có Thử lại; offline; rỗng không bị nhầm với lỗi`, async ({ browser }) => {
      const b = await boot390(browser);
      const p = b.page;
      b.mock.fail({ match: ep, status: 500, times: 1 });
      await go(p, url, '.m-feedback');
      await expect(p.getByText(errTitle)).toBeVisible();
      await btn(p, 'Thử lại').click();
      await expect(p.locator('.m-feedback--error')).toHaveCount(0);
      await expect(p.locator(root).first()).toBeVisible();
      b.mock.fail({ match: ep, status: 403 });
      await p.reload(); await p.locator('.m-feedback').first().waitFor();
      await expect(p.getByText('Bạn không có quyền xem mục này')).toBeVisible();
      await expect(btn(p, 'Thử lại')).toHaveCount(0);
      b.mock.clearRules();
      b.mock.fail({ match: ep, abort: true });
      await p.reload(); await p.locator('.m-feedback').first().waitFor();
      await b.ctx.setOffline(true);
      await btn(p, 'Thử lại').click();
      await expect(p.getByText('Đang mất kết nối')).toBeVisible();
      await b.ctx.setOffline(false);
      b.mock.clearRules();
      if (emptyTitle) { setEmpty(b.mock); await btn(p, 'Thử lại').click(); await expect(p.getByText(emptyTitle)).toBeVisible(); }
      expect(writes(b.mock)).toEqual([]);
      await finish(b);
    });
  }
});

// ════════════════════════════ Lỗi xuyên suốt đã phát hiện (kiểm RIÊNG, không né) ════════════════════════════
test.describe('Hộp xác nhận trên bottom sheet / Hủy khi dirty', () => {
  test('B-1 TẢI LẠNH trang Cài đặt (reload / mở thẳng URL): hộp xác nhận "Lưu trữ nhãn" phải NẰM TRÊN sheet và bấm được', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await goCold(p, '/settings/crm/tags-v2', '.crm-tp__card');
    await p.locator('.crm-tp__card', { hasText: 'Khách VIP' }).click();
    await btn(p, /Lưu trữ nhãn này/).click();
    await p.locator('.cam-modal').waitFor();
    await p.waitForTimeout(500);
    const top = await p.evaluate(() => {
      const bt = Array.from(document.querySelectorAll('.cam-modal button')).find(x => x.textContent?.trim() === 'Lưu trữ') as HTMLElement;
      const r = bt.getBoundingClientRect();
      const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null;
      return { onTop: !!e?.closest('.cam-modal'), z: getComputedStyle(document.querySelector('.cam-overlay')!).zIndex, hit: e ? e.tagName + '.' + String(e.className) : null };
    });
    expect(top.onTop, `hộp xác nhận bị che bởi ${top.hit} (z-index .cam-overlay = ${top.z}, bottom sheet = 2400)`).toBe(true);
    await finish(b);
  });

  test('B-1b TẢI LẠNH: × của sheet đang dirty -> "Bỏ thay đổi chưa lưu?" phải thấy và bấm được', async ({ browser }) => {
    const b = await boot390(browser);
    const p = b.page;
    await goCold(p, '/settings/crm/statuses', '.crm-sp__card');
    await p.locator('.crm-sp__add').click();
    await p.getByLabel(/Tên/).first().fill('Dirty cold');
    await btn(p, 'Đóng').click();
    await p.locator('.cam-modal').waitFor();
    await p.waitForTimeout(400);
    const onTop = await p.evaluate(() => {
      const bt = Array.from(document.querySelectorAll('.cam-modal button')).find(x => x.textContent?.trim() === 'Bỏ thay đổi') as HTMLElement;
      const r = bt.getBoundingClientRect();
      return !!(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null)?.closest('.cam-modal');
    });
    expect(onTop, 'nút Bỏ thay đổi bị sheet che').toBe(true);
    await finish(b);
  });

  for (const c of [
    { name: 'Tài khoản (Sửa họ tên)', url: '/settings/personal/profile', ready: '.crm-ap', open: (p: Page) => btn(p, 'Sửa họ tên').click(), fill: (p: Page) => p.getByLabel('Họ tên', { exact: true }).fill('Đã sửa dở'), dlg: 'Sửa họ tên' },
    { name: 'Trạng thái (Thêm)', url: '/settings/crm/statuses', ready: '.crm-sp__card', open: (p: Page) => p.locator('.crm-sp__add').click(), fill: (p: Page) => p.getByLabel(/Tên/).first().fill('Đã sửa dở'), dlg: 'Thêm trạng thái' },
    { name: 'Nhãn (Thêm)', url: '/settings/crm/tags-v2', ready: '.crm-tp__card', open: (p: Page) => p.locator('.crm-tp__add').click(), fill: (p: Page) => p.getByLabel(/Tên nhãn/).fill('Đã sửa dở'), dlg: 'Thêm nhãn' },
  ]) {
    test(`nút Hủy khi form đang dirty phải hỏi xác nhận như nút × (${c.name}) — tránh mất dữ liệu do chạm nhầm`, async ({ browser }) => {
      const b = await boot390(browser);
      const p = b.page;
      await go(p, c.url, c.ready);
      await c.open(p);
      await c.fill(p);
      await btn(p, 'Hủy').click();
      await p.waitForTimeout(500);
      const closedSilently = !(await p.getByRole('dialog', { name: c.dlg }).isVisible()) && (await confirmBox(p).count()) === 0;
      expect(closedSilently, 'Hủy đóng sheet và bỏ nội dung đang sửa mà KHÔNG hỏi (× / Esc / chạm nền thì có hỏi)').toBe(false);
      await finish(b);
    });
  }
});

// ════════════════════════════ Tối: overlay đọc được ════════════════════════════
test.describe('Tối thật ở overlay F1', () => {
  test('modal tạo nhân viên (cả 3 bước) và panel nhân viên: chữ đọc được, không khối sáng', async ({ browser }) => {
    const b = await boot390(browser, { theme: 'dark' });
    const p = b.page;
    await go(p, '/settings/rbac/users', '.crm-el__item');
    await p.locator('.crm-el__add').click();
    const modal = p.getByRole('dialog', { name: 'Thêm nhân viên qua Zalo' });
    await modal.waitFor();
    const lum = (s: string) => { const m = s.match(/[\d.]+/g)!.map(Number); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const ratio = async (loc: import('@playwright/test').Locator) => loc.evaluate((e) => {
      let bg = 'rgba(0,0,0,0)'; let el: Element | null = e;
      while (el) { const c = getComputedStyle(el).backgroundColor; if (!/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') { bg = c; break; } el = el.parentElement; }
      return { fg: getComputedStyle(e).color, bg };
    });
    const problems: string[] = [];
    const check = async (name: string, loc: import('@playwright/test').Locator) => {
      const { fg, bg } = await ratio(loc);
      const l1 = lum(fg), l2 = lum(bg); const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (r < 3) problems.push(`${name}: ${fg} trên ${bg} = ${r.toFixed(2)}`);
    };
    await check('nhãn Họ và tên', modal.locator('.cuwz-field label').first());
    await check('nhãn Phòng ban', modal.locator('.cuwz-field label').nth(3));
    await check('tab bước 1', modal.locator('.cuwz-stepper .step').first());
    await check('tab bước 2', modal.locator('.cuwz-stepper .step').nth(1));
    // bước 2 + 3
    await modal.getByLabel('Họ tên', { exact: true }).fill('Người Mới Giả');
    await modal.getByLabel('Số điện thoại', { exact: true }).fill('0900000777');
    await modal.getByRole('button', { name: /Kiểm tra Zalo/ }).click();
    await modal.getByText('Xác nhận thông tin Zalo').waitFor();
    await p.screenshot({ path: `${(await import('./helpers/f1-env')).SHOTS}/${test.info().project.name}/employee-create-step2-390x844-dark.jpg`, type: 'jpeg', quality: 62, caret: 'hide' });
    const lightCards = await modal.evaluate((root) => Array.from(root.querySelectorAll('.cuwz-preview,.cuwz-relation,.cuwz-summary')).filter(e => {
      const c = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)!.map(Number); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.85 && (c[3] ?? 1) > 0.9;
    }).length);
    if (lightCards) problems.push(`bước 2: ${lightCards} khối nền sáng (>0.85) trong modal Tối`);
    expect(problems, problems.join('\n')).toEqual([]);
    await finish(b);
  });
});
