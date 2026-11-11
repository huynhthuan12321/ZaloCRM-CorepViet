import { defineConfig } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
const out = process.env.E_QA_OUTPUT ?? path.join(os.tmpdir(), 'crm-E-qa-output');
export default defineConfig({
  testDir: '.', testMatch: 'pwa-e.spec.ts', timeout: 120000, expect: { timeout: 20000 }, workers: 2,
  fullyParallel: true, retries: 0, outputDir: path.join(out, 'test-results'),
  reporter: [['list'], ['json', { outputFile: path.join(out, 'playwright.json') }], ['html', { outputFolder: path.join(out, 'html'), open: 'never' }]],
  projects: [{ name:'chromium', use: { browserName: 'chromium' } }, { name:'webkit', use: { browserName: 'webkit' } }], use: { trace:'off', screenshot:'only-on-failure', locale:'vi-VN', timezoneId:'Asia/Ho_Chi_Minh' },
});
