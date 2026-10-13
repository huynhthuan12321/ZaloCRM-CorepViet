// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { mkdir, readFile, writeFile, rename, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export class Ledger {
  data = { version: 1, messages: {}, commands: {}, crmCommands: {} };
  queue = Promise.resolve();
  constructor(file, account) { this.file = file; this.account = account; }
  async load() {
    try {
      const loaded = JSON.parse(await readFile(this.file, 'utf8'));
      if (loaded.version !== 1 || loaded.account !== this.account || !loaded.messages || !loaded.commands) throw Error('LEDGER_INVALID_OR_ACCOUNT_MISMATCH');
      loaded.crmCommands ??= {};
      this.data = loaded;
    } catch (e) { if (e.code !== 'ENOENT') throw e; this.data.account = this.account; }
    // A crash cannot establish whether an outstanding intent was submitted.
    await this.update(data => { for (const cmd of Object.values(data.commands)) if (['pending', 'submitted'].includes(cmd.state)) cmd.state = 'unknown'; });
    return this;
  }
  update(fn) {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.data), result = fn(next);
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const temp = this.file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      const handle = await open(temp, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
      await rename(temp, this.file);
      this.data = next;
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async ingest(messages) {
    return this.update(data => {
      let added = 0;
      for (const msg of messages) {
        if (msg.accountId !== this.account || !msg.id || !msg.threadId) throw Error('MESSAGE_IDENTITY_INVALID');
        const key = `${msg.threadId}:${msg.id}`;
        if (!data.messages[key]) { data.messages[key] = msg; added++; }
        const cmd = msg.commandId && data.commands[msg.commandId];
        if (cmd && cmd.text === msg.text && msg.direction === 'self' && cmd.threadId === msg.threadId && ['submitted', 'unknown'].includes(cmd.state)) {
          cmd.state = 'confirmed'; cmd.messageId = msg.id;
        }
      }
      return added;
    });
  }
  async intent(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw Error('TEXT_REQUIRED_MAX_1000');
    const command = {
      id: randomUUID(),
      accountId: this.account,
      threadId: `mock-thread-${this.account.slice(-2)}`,
      text,
      state: 'pending',
      createdAt: new Date().toISOString(),
    };
    await this.update(data => { data.commands[command.id] = command; });
    return command.id;
  }
  async transition(id, state, messageId) {
    const allowed = { pending: ['submitted', 'failed'], submitted: ['confirmed', 'failed', 'unknown'], unknown: ['confirmed'] };
    await this.update(data => {
      const cmd = data.commands[id];
      if (!cmd || !allowed[cmd.state]?.includes(state)) throw Error('INVALID_COMMAND_TRANSITION');
      cmd.state = state; if (messageId) cmd.messageId = messageId;
    });
  }
  async recordCrmCommand(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) {
      throw Error('CRM_COMMAND_ID_INVALID');
    }
    await this.update(data => {
      data.crmCommands ??= {};
      data.crmCommands[id] ??= { claimedAt: new Date().toISOString() };
    });
  }
}
