// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createMock } from '../mock/server.mjs';
import { launchMockBrowser } from '../src/browser-adapter.mjs';
import { root } from '../src/config.mjs';

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function browserProcesses(startedAt) {
  if (process.platform !== 'win32') return null;
  const script = [
    `$cutoff=[datetime]::Parse('${startedAt.toISOString()}')`,
    "$rows=Get-Process -Name 'chrome-headless-shell' -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -ge $cutoff } | Select-Object Id,WorkingSet64,CPU",
    'if($rows){$rows|ConvertTo-Json -Compress}else{"[]"}',
  ].join(';');
  const parsed = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function login(browser) {
  await browser.page.waitForFunction(() => document.body.dataset.authenticated === 'false');
  await browser.page.click('#newqr');
  await browser.page.waitForFunction(() => document.getElementById('qr').textContent.length > 0);
  await browser.page.click('#confirm');
  await browser.page.waitForFunction(() => document.body.dataset.authenticated === 'true');
}

await mkdir(path.join(root, 'runtime'), { recursive: true });
const runtime = await mkdtemp(path.join(root, 'runtime', 'tt09-benchmark-'));
const startedAt = new Date();
const mocks = await Promise.all([
  createMock({ account: 'mock-personal-01' }),
  createMock({ account: 'mock-personal-02' }),
]);
const browsers = [];
try {
  for (let index = 0; index < mocks.length; index++) {
    browsers.push(await launchMockBrowser({
      origin: mocks[index].origin,
      profile: path.join(runtime, `profile-${index + 1}`),
      headless: true,
    }));
  }
  await Promise.all(browsers.map(login));
  const before = browserProcesses(startedAt);
  const latencies = [];
  for (let iteration = 0; iteration < 20; iteration++) {
    const began = performance.now();
    await Promise.all(browsers.map(async (browser, accountIndex) => {
      await browser.page.fill('#inject-text', `tt09-${accountIndex + 1}-${iteration}`);
      await browser.page.click('#inject');
      await browser.messages();
    }));
    latencies.push(performance.now() - began);
  }
  await new Promise(resolve => setTimeout(resolve, 1_000));
  const after = browserProcesses(startedAt);
  const total = (rows, key) => rows?.reduce((sum, row) => sum + Number(row[key] ?? 0), 0) ?? null;
  const elapsedSeconds = Math.max(1, (Date.now() - startedAt.getTime()) / 1000);
  const cpuSeconds = before && after ? Math.max(0, total(after, 'CPU') - total(before, 'CPU')) : null;
  const report = {
    at: new Date().toISOString(),
    scope: 'two local mock Chromium profiles; no real TikTok or production data',
    workers: 2,
    iterations: latencies.length,
    latencyMs: {
      p50: Math.round(percentile(latencies, 0.5) * 100) / 100,
      p95: Math.round(percentile(latencies, 0.95) * 100) / 100,
      max: Math.round(Math.max(...latencies) * 100) / 100,
    },
    chromium: {
      processCount: after?.length ?? null,
      workingSetBytes: total(after, 'WorkingSet64'),
      averageWorkingSetPerWorkerBytes: after ? Math.round(total(after, 'WorkingSet64') / 2) : null,
      cpuPercentDuringWorkload: cpuSeconds === null ? null : Math.round((cpuSeconds / elapsedSeconds) * 10000) / 100,
    },
    node: process.memoryUsage(),
  };
  await writeFile(path.join(runtime, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ runtime, ...report }, null, 2));
} finally {
  await Promise.allSettled(browsers.map(browser => browser.close()));
  await Promise.allSettled(mocks.map(mock => mock.close()));
  if (!path.resolve(runtime).startsWith(path.resolve(root, 'runtime') + path.sep)) throw Error('UNSAFE_BENCHMARK_CLEANUP');
  for (const name of ['profile-1', 'profile-2']) await rm(path.join(runtime, name), { recursive: true, force: true });
}
