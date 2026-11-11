// F1 Cài đặt mobile — ma trận bố cục: 8 kích thước điện thoại (dọc + ngang cảm ứng) x Sáng/Tối x 2 engine, mọi route F1 + overlay.
// Mức bằng chứng: Chromium / WebKit DESKTOP có mô phỏng cảm ứng (hasTouch + isMobile). KHÔNG phải Safari iPhone thật, không VoiceOver.
// Mỗi route: không tràn trang, nút/ô chọn >=44px, ô nhập >=16px, tương phản >=3, Tối không có khối nền sáng, nội dung cuối nằm trên tabbar (safe-area 34px mô phỏng).
import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { audit } from './helpers/audit';
import { contrastIssues, bottomClearance } from './helpers/qa-checks';
import { simulateSafe } from './helpers/mock-chat';
import { F1_ROUTES } from './helpers/mock-f1';
import { PHONES, RES, SHOTS, boot, ensureDir, go, lightBlocks, markQaIgnores, overflowInfo, overlayInViewport, settle, shortVuetifyFields } from './helpers/f1-env';

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'parallel' });

const SHOT_VPS = new Set(['320x568', '390x844', '844x390']);
interface Issue { vp: string; theme: string; route: string; kind: string; detail: string }

for (const vp of PHONES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`ma trận ${vp.name} ${theme}: mọi route F1 + overlay`, async ({ browser, browserName }) => {
      test.setTimeout(300_000);
      const { ctx, page, errors } = await boot(browser, vp, { theme });
      const issues: Issue[] = [];
      const add = (route: string, kind: string, detail: unknown) => issues.push({ vp: vp.name, theme, route, kind, detail: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600) });
      const shotDir = ensureDir(path.join(SHOTS, browserName));
      const shot = async (name: string) => {
        if (SHOT_VPS.has(vp.name)) await page.screenshot({ path: path.join(shotDir, `${name}-${vp.name}-${theme}.jpg`), type: 'jpeg', quality: 62, animations: 'disabled', caret: 'hide' });
      };

      for (const r of F1_ROUTES) {
        try {
          await go(page, r.url, r.ready);
          await settle(page, 500);
          await simulateSafe(page, 34, 0);
          const ov = await overflowInfo(page);
          if (ov.docX > 0 || ov.bodyX > 0 || ov.mainX > 0 || ov.settingsX > 0) add(r.key, 'tràn-ngang', ov);
          await markQaIgnores(page);
          const a = await audit(page, '.crm-settings', ['.crm-settings']);
          if (a.offenders.length) add(r.key, 'lọt-mép', a.offenders.slice(0, 6));
          const st = a.smallTargets.filter(t => !t.sel.startsWith('input.v-field__input'));
          if (st.length) add(r.key, 'chạm<44', st.slice(0, 8));
          const sf = await shortVuetifyFields(page, '.crm-settings');
          if (sf.length) add(r.key, 'ô-Vuetify<44', sf.slice(0, 6));
          if (a.smallInputs.length) add(r.key, 'input<16', a.smallInputs.slice(0, 6));
          const c = await contrastIssues(page, '.crm-settings', 3);
          if (c.length) add(r.key, 'tương-phản<3', c.slice(0, 5));
          if (theme === 'dark') { const lb = await lightBlocks(page, ['.crm-settings']); if (lb.length) add(r.key, 'khối-sáng-trong-Tối', lb.slice(0, 5)); }
          const bc = await bottomClearance(page);
          if (bc.tabbarTop !== null && bc.lastBottom > bc.tabbarTop + 1) add(r.key, 'bị-tabbar-che', bc);
          if (bc.docOverflowX) add(r.key, 'cuộn-ngang-document', bc);
          await shot(r.key);
        } catch (e) { add(r.key, 'không-dựng-được', String((e as Error).message).split('\n')[0]); }
      }

      // Overlay: mở rồi đo trong chính overlay (nút >=44, input >=16, footer trong viewport, Tối không khối sáng).
      const overlays: Array<{ key: string; url: string; ready: string; open: () => Promise<void>; scope: string; close: () => Promise<void> }> = [
        { key: 'account-name-sheet', url: '/settings/personal/profile', ready: '.crm-ap', scope: '.m-sheet', open: () => page.getByRole('button', { name: 'Sửa họ tên' }).click(), close: () => page.getByRole('button', { name: 'Hủy', exact: true }).click() },
        { key: 'status-sheet', url: '/settings/crm/statuses', ready: '.crm-sp__card', scope: '.m-sheet', open: () => page.locator('.crm-sp__add').click(), close: () => page.getByRole('button', { name: 'Hủy', exact: true }).click() },
        { key: 'tag-edit-sheet', url: '/settings/crm/tags-v2', ready: '.crm-tp__card', scope: '.m-sheet', open: () => page.locator('.crm-tp__card').first().click(), close: () => page.getByRole('button', { name: 'Hủy', exact: true }).click() },
        { key: 'employee-panel', url: '/settings/rbac/users', ready: '.crm-el__item', scope: '.panel--m', open: () => page.locator('.crm-el__card').first().click(), close: () => page.getByRole('button', { name: 'Đóng', exact: true }).first().click() },
        { key: 'employee-create', url: '/settings/rbac/users', ready: '.crm-el__item', scope: '.cuwz-modal--m', open: () => page.locator('.crm-el__add').click(), close: () => page.getByRole('button', { name: 'Huỷ', exact: true }).click() },
      ];
      for (const o of overlays) {
        try {
          await go(page, o.url, o.ready);
          await settle(page, 300);
          await o.open();
          await page.locator(o.scope).first().waitFor({ timeout: 8000 });
          await page.waitForTimeout(450); // chờ transition trượt vào
          await markQaIgnores(page);
          const a = await audit(page, o.scope, [o.scope]);
          if (a.offenders.length) add(o.key, 'lọt-mép', a.offenders.slice(0, 6));
          const st = a.smallTargets.filter(t => !t.sel.startsWith('input.v-field__input'));
          if (st.length) add(o.key, 'chạm<44', st.slice(0, 10));
          if (a.smallInputs.length) add(o.key, 'input<16', a.smallInputs.slice(0, 8));
          const c = await contrastIssues(page, o.scope, 3);
          if (c.length) add(o.key, 'tương-phản<3', c.slice(0, 5));
          if (theme === 'dark') { const lb = await lightBlocks(page, [o.scope]); if (lb.length) add(o.key, 'khối-sáng-trong-Tối', lb.slice(0, 5)); }
          const v = await overlayInViewport(page, o.scope);
          if (!v.found) add(o.key, 'overlay-không-thấy', v);
          else {
            if (v.rect!.left < -1 || v.rect!.right > v.vw + 1) add(o.key, 'overlay-tràn-ngang', v);
            if (v.footerBottom !== null && v.footerBottom > v.vh + 1) add(o.key, 'footer-ngoài-viewport', v);
          }
          const ov = await overflowInfo(page);
          if (ov.docX > 0) add(o.key, 'tràn-ngang', ov);
          await shot(o.key);
          await o.close().catch(() => undefined);
        } catch (e) { add(o.key, 'không-dựng-được', String((e as Error).message).split('\n')[0]); }
      }

      ensureDir(RES);
      fs.writeFileSync(path.join(RES, `matrix-${vp.name}-${theme}-${browserName}.json`), JSON.stringify({ vp: vp.name, theme, browserName, pageErrors: errors, issues }, null, 2));
      await ctx.close();
      expect.soft(errors, 'pageerror').toEqual([]);
      expect(issues, `${issues.length} vấn đề bố cục:\n${issues.map(i => `${i.route}/${i.kind}: ${i.detail}`).join('\n')}`).toEqual([]);
    });
  }
}
