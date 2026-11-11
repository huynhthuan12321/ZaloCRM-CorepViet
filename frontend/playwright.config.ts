// QA mobile (đợt B+). Chạy trên BẢN BUILD (`npm run build` -> dist) qua `vite preview`, không chạy dev server.
// Backend KHÔNG chạy: mọi /api/v1 và socket.io được mock bằng page.route (xem e2e/helpers/mock-api.ts).
// Output chỉ ghi vào test-results/ và playwright-report/ (trong frontend/; cần được .gitignore bỏ qua).
import { defineConfig, devices } from '@playwright/test';

const SHELL_PORT = Number(process.env.D_APP_PORT ?? 4174); // bản build của worktree hiện tại (frontend/dist)
const BASE_PORT = Number(process.env.D_BASE_PORT ?? 4175); // bản build mobile/base để so desktop (chỉ dựng khi có BASE_DIST)
const BASE_DIST = process.env.BASE_DIST; // thư mục dist đã build sẵn từ mobile/base (nằm trong %TEMP%)

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.D_QA_RUN_ID ? `./test-results/${process.env.D_QA_RUN_ID}` : './test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: process.env.D_QA_RUN_ID ? `playwright-report/${process.env.D_QA_RUN_ID}` : 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${SHELL_PORT}`,
    trace: 'off',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }, // WebKit desktop, KHÔNG phải Safari iPhone
  ],
  webServer: [
    {
      command: `npx vite preview --port ${SHELL_PORT} --strictPort`,
      url: `http://localhost:${SHELL_PORT}/login`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    ...(BASE_DIST
      ? [
          {
            command: `npx vite preview --outDir "${BASE_DIST}" --port ${BASE_PORT} --strictPort`,
            url: `http://localhost:${BASE_PORT}/login`,
            reuseExistingServer: true,
            timeout: 60_000,
          },
        ]
      : []),
  ],
});
