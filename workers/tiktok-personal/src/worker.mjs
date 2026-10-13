// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc
import { resolveConfig } from './config.mjs';
import { launchTikTokBrowser } from './browser.mjs';
import {
  claimCommand,
  claimSessionControl,
  publishEvent,
  publishSession,
  reportCommand,
} from './crm-client.mjs';

const config = resolveConfig();
const browser = await launchTikTokBrowser(config);
let stopping = false;
let lastSessionKey = '';
let lastSessionAt = 0;
let busy = false;

const stop = () => { stopping = true; };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
browser.page.on('close', stop);

async function reportSession(observation) {
  const key = JSON.stringify({
    state: observation.state,
    identityUsername: observation.identityUsername,
    errorCode: observation.errorCode,
    hasQr: !!observation.qrDataUrl,
  });
  if (key === lastSessionKey && Date.now() - lastSessionAt < config.sessionReportMs) return;
  await publishSession(config, observation);
  lastSessionKey = key;
  lastSessionAt = Date.now();
}

async function syncInbound() {
  const threads = await browser.listThreads(config.maxThreadsPerCycle);
  let published = 0;
  for (const item of threads) {
    if (stopping) break;
    const snapshot = await browser.openThread(item.id);
    if (snapshot.status !== 'observed' || !snapshot.thread) continue;
    for (const message of snapshot.messages) {
      await publishEvent(config, snapshot.thread, message);
      published++;
    }
  }
  return published;
}

async function dispatchOne() {
  const command = await claimCommand(config);
  if (!command) return false;
  let result;
  try {
    result = await browser.send(command);
  } catch {
    result = { kind: 'unknown', errorCode: 'TIKTOK_TRANSPORT_UNCERTAIN' };
  }
  await reportCommand(config, command.commandId, result);
  return true;
}

console.log(`TikTok worker started account=${config.accountId} username=@${config.expectedUsername}`);
try {
  while (!stopping) {
    const control = await claimSessionControl(config).catch(error => {
      console.warn(`control_claim_failed status=${error?.status ?? 'network'}`);
      return null;
    });
    if (control?.epoch) {
      if (control.expectedUsername.toLowerCase() !== config.expectedUsername.toLowerCase()) {
        console.warn('control_claim_failed status=identity_mismatch');
        stopping = true;
        continue;
      }
      if (config.epoch !== control.epoch) {
        config.epoch = control.epoch;
        lastSessionKey = '';
        lastSessionAt = 0;
      }
      if (control.action) {
        try {
          await browser.beginLogin(control.action);
        } catch (error) {
          console.warn(`login_action_failed code=${error?.message ?? 'unknown'}`);
        } finally {
          if (control.action.method === 'password') control.action.password = '';
        }
      }
    }
    const session = await browser.observeSession().catch(() => ({
      state: 'error',
      errorCode: 'BROWSER_OBSERVATION_FAILED',
      observedAt: new Date().toISOString(),
    }));
    await reportSession(session).catch(error => {
      if (error?.status === 409) {
        lastSessionKey = '';
        lastSessionAt = 0;
      }
      console.warn(`session_report_failed status=${error?.status ?? 'network'}`);
    });
    if (session.state === 'authenticated' && !busy) {
      busy = true;
      try {
        await syncInbound();
        await dispatchOne();
      } catch (error) {
        console.warn(`worker_cycle_failed code=${error?.message ?? 'unknown'}`);
      } finally {
        busy = false;
      }
    }
    await new Promise(resolve => setTimeout(resolve, config.pollMs));
  }
} finally {
  await browser.close();
}
