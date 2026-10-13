// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
export class SendController {
  busy = false;
  constructor({ ledger, session, adapter }) { Object.assign(this, { ledger, session, adapter }); }
  async send(text, fault = '') {
    if (this.busy) throw Error('SEND_BUSY');
    this.busy = true;
    try {
      this.session.observe(await this.adapter.snapshot());
      if (!this.session.canSend()) throw Error('IDENTITY_NOT_VERIFIED');
      const id = await this.ledger.intent(text);
      // Mark before crossing the browser/transport boundary.
      await this.ledger.transition(id, 'submitted');
      let ack;
      try { ack = await this.adapter.send({ commandId: id, text, fault }); }
      catch { await this.ledger.transition(id, 'unknown'); return id; }
      if (ack.commandId === id && ack.messageId) await this.ledger.transition(id, 'confirmed', ack.messageId);
      else if (ack.rejected === true) await this.ledger.transition(id, 'failed');
      else await this.ledger.transition(id, 'unknown');
      return id;
    } finally { this.busy = false; }
  }
  async sync() {
    if (this.busy) throw Error('SEND_BUSY');
    this.busy = true;
    try {
      this.session.observe(await this.adapter.snapshot());
      if (!this.session.canSend()) throw Error('IDENTITY_NOT_VERIFIED');
      return await this.ledger.ingest(await this.adapter.messages());
    } finally { this.busy = false; }
  }
}
