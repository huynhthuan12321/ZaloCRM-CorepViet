// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function acquireAccountLease(directory) {
  const token = randomUUID();
  try {
    await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') throw Error('ACCOUNT_WORKER_ALREADY_LEASED');
    throw error;
  }
  const ownerFile = path.join(directory, 'owner.json');
  try {
    await writeFile(ownerFile, JSON.stringify({
      token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  let releasePromise;
  return {
    directory,
    async release() {
      releasePromise ??= (async () => {
        const owner = JSON.parse(await readFile(ownerFile, 'utf8'));
        if (owner.token !== token) throw Error('ACCOUNT_LEASE_OWNER_MISMATCH');
        await rm(directory, { recursive: true });
      })();
      return releasePromise;
    },
  };
}
