// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { config } from './config.mjs';
import { Session } from './session.mjs';
import { launchMockBrowser } from './browser-adapter.mjs';
import readline from 'node:readline';
import { Ledger } from './ledger.mjs';
import { acquireAccountLease } from './account-lease.mjs';
import { SendController } from './send-controller.mjs';
import { crmBridgeConfig, publishLedgerToCrm } from './crm-bridge.mjs';
import { claimCrmCommand, executeCrmCommand } from './crm-outbound.mjs';
import { createPilotResourceSampler, publishPilotHeartbeat, reconcilePilot } from './crm-pilot.mjs';
const workerConfig = config();
const lease = await acquireAccountLease(workerConfig.lease);
const state = new Session(workerConfig.account);
let browser;
try {
  browser = await launchMockBrowser(workerConfig);
} catch (error) {
  await lease.release();
  throw error;
}
const ledger = await new Ledger(workerConfig.ledger, workerConfig.account).load();
const controller = new SendController({ ledger, session: state, adapter: browser });
const resourceSampler = createPilotResourceSampler({ profile: workerConfig.profile, ledger: workerConfig.ledger });
const bridge = crmBridgeConfig();
const syncAndPublish = async () => {
  const count = await controller.sync();
  if (bridge) await publishLedgerToCrm(Object.values(ledger.data.messages), bridge);
  return count;
};
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
input.on('line', async line => {
  try {
    if (line.startsWith('send ')) {
      const id = await controller.send(line.slice(5));
      console.log(`command=${id} state=${ledger.data.commands[id].state}`);
    } else if (line.startsWith('fault-send ')) {
      const id = await controller.send(line.slice(11), 'after_accept');
      console.log(`command=${id} state=${ledger.data.commands[id].state}`);
    } else if (line === 'sync') console.log(`new_messages=${await syncAndPublish()}`);
    else if (line === 'status') console.log(`session=${state.state} messages=${Object.keys(ledger.data.messages).length}`);
    else console.log('Commands: send TEXT | fault-send TEXT | sync | status');
  } catch { console.log('command_failed; verify identity/session or fixture availability'); }
});
let stopping = false, previous, lastSync = 0, lastClaim = 0, lastHeartbeat = 0, lastReconcile = 0;
const stop = async () => {
  stopping = true;
  input.close();
  state.close();
  await ledger.queue;
  await browser.close();
  resourceSampler.close();
  await lease.release();
};
process.once('SIGINT', stop); process.once('SIGTERM', stop);
browser.page.on('close', () => { stopping = true; });
console.log(`Mock-only worker account=${workerConfig.account}. Confirmation is simulated in the local browser.`);
try {
  while (!stopping) {
    try { state.observe(await browser.snapshot()); } catch { state.close(); state.state = 'error'; }
    if (state.state !== previous) { console.log(`session_state=${state.state}`); previous = state.state; }
    if (state.canSend() && !controller.busy && Date.now() - lastSync > 1000) {
      lastSync = Date.now();
      try { const count = await syncAndPublish(); if (count) console.log(`new_messages=${count}`); }
      catch { console.log('sync_failed; existing ledger preserved'); }
    }
    if (bridge && state.canSend() && !controller.busy && Date.now() - lastClaim > 1000) {
      lastClaim = Date.now();
      try {
        const command = await claimCrmCommand(bridge);
        if (command) {
          await ledger.recordCrmCommand(command.commandId);
          const result = await executeCrmCommand({ cfg: bridge, command, browser });
          console.log(`crm_command=${command.commandId} result=${result.kind}`);
        }
      } catch {
        // Lost reporting leaves PROCESSING for the CRM reaper; this worker does not resend it.
        console.log('crm_outbound_failed; command will not be retried by this worker');
      }
    }
    if (bridge && Date.now() - lastHeartbeat > 5_000) {
      lastHeartbeat = Date.now();
      try { await publishPilotHeartbeat(bridge, state.state, ledger, resourceSampler); }
      catch { console.log('pilot_heartbeat_failed'); }
    }
    if (bridge && state.canSend() && Date.now() - lastReconcile > 30_000) {
      lastReconcile = Date.now();
      try {
        const result = await reconcilePilot(bridge, ledger);
        console.log(`pilot_reconcile missing_crm=${result.missingInCrm} missing_worker=${result.missingInWorker} command_mismatch=${result.commandMismatch}`);
      } catch { console.log('pilot_reconcile_failed'); }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
} finally {
  input.close();
  await ledger.queue;
  await browser.close();
  resourceSampler.close();
  await lease.release();
}
