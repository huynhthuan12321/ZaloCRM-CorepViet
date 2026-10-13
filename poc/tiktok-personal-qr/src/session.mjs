// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
export class Session {
  state = 'disconnected';
  accountId = null;
  hadSession = false;
  constructor(expected) { this.expected = expected; }
  observe(s) {
    this.accountId = null;
    if (!s.authenticated) this.state = this.hadSession ? 'session_expired' : 'awaiting_qr';
    else if (s.needsVerification) this.state = 'needs_verification';
    else if (s.accountId !== this.expected) this.state = 'identity_mismatch';
    else { this.state = 'verifying_identity'; this.accountId = s.accountId; this.hadSession = true; this.state = 'connected'; }
    return this.state;
  }
  canSend() { return this.state === 'connected' && this.accountId === this.expected; }
  close() { this.state = 'disconnected'; this.accountId = null; }
}
