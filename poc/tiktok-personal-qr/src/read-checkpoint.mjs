// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/** Durable metadata checkpoint on a caller-selected thread, never a send path.
 * Newly observed IDs may be historical after scrolling, not newly sent messages.
 */
export class ReadCheckpoint {
  constructor({ ledger, expectedUsername, expectedPeerUsername, threadKey }) {
    if (!expectedUsername || !expectedPeerUsername || !threadKey) throw Error('EXPLICIT_THREAD_SCOPE_REQUIRED');
    Object.assign(this, { ledger, expectedUsername, expectedPeerUsername, threadKey });
  }
  async observe(snapshot, observedAt = new Date().toISOString()) {
    if (!['observed', 'partial'].includes(snapshot.status) || snapshot.scope !== 'rendered_dom_only') throw Error('SNAPSHOT_NOT_READY');
    if (snapshot.accountUsername !== this.expectedUsername || snapshot.peerUsername !== this.expectedPeerUsername) throw Error('SNAPSHOT_SCOPE_MISMATCH');
    if (!Number.isFinite(Date.parse(observedAt))) throw Error('OBSERVATION_TIME_INVALID');
    return this.ledger.update(data => {
      data.readCheckpoints ??= {};
      let checkpoint = data.readCheckpoints[this.threadKey];
      if (checkpoint && (checkpoint.accountUsername !== this.expectedUsername || checkpoint.peerUsername !== this.expectedPeerUsername)) throw Error('CHECKPOINT_SCOPE_MISMATCH');
      checkpoint ??= { accountUsername: this.expectedUsername, peerUsername: this.expectedPeerUsername, ids: {}, observations: 0, interruptions: 0, coverageGapPossible: false, historyComplete: false };
      let newlyObserved = 0;
      const batch = new Set();
      for (const msg of snapshot.messages) {
        if (typeof msg.externalMessageId !== 'string' || !/^\d+$/.test(msg.externalMessageId) || batch.has(msg.externalMessageId)) throw Error('MESSAGE_ID_INVALID_OR_DUPLICATE');
        batch.add(msg.externalMessageId);
        if (!['self', 'inbound', 'unknown'].includes(msg.direction) || !['text', 'unsupported'].includes(msg.contentType)) throw Error('MESSAGE_METADATA_INVALID');
        if (!Object.hasOwn(checkpoint.ids, msg.externalMessageId)) {
          checkpoint.ids[msg.externalMessageId] = { direction: msg.direction, contentType: msg.contentType, firstObservedAt: observedAt };
          newlyObserved++;
        }
      }
      checkpoint.observations++;
      checkpoint.lastObservedAt = observedAt;
      checkpoint.lastVisibleCount = snapshot.messages.length;
      checkpoint.lastIssues = [...new Set(snapshot.issues)];
      // Successful snapshots cannot prove recovery of every missed message.
      checkpoint.historyComplete = false;
      data.readCheckpoints[this.threadKey] = checkpoint;
      return { newlyObserved, totalObserved: Object.keys(checkpoint.ids).length, visibleCount: snapshot.messages.length, coverageGapPossible: checkpoint.coverageGapPossible, historyComplete: false };
    });
  }
  async markUnavailable(reason = 'READ_UNAVAILABLE') {
    const allowed = ['READ_UNAVAILABLE', 'SESSION_EXPIRED', 'PAGE_UNAVAILABLE', 'WORKER_RESTART'];
    if (!allowed.includes(reason)) throw Error('UNKNOWN_INTERRUPTION_REASON');
    return this.ledger.update(data => {
      data.readCheckpoints ??= {};
      const cp = data.readCheckpoints[this.threadKey] ?? { accountUsername: this.expectedUsername, peerUsername: this.expectedPeerUsername, ids: {}, observations: 0, interruptions: 0, historyComplete: false };
      if (cp.accountUsername !== this.expectedUsername || cp.peerUsername !== this.expectedPeerUsername) throw Error('CHECKPOINT_SCOPE_MISMATCH');
      cp.interruptions++; cp.coverageGapPossible = true; cp.lastInterruption = reason;
      data.readCheckpoints[this.threadKey] = cp;
    });
  }
}
