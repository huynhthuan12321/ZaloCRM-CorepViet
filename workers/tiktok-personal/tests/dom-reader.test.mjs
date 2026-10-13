import test from 'node:test';
import assert from 'node:assert/strict';
import { readThreadDocument } from '../src/dom-reader.mjs';

test('serialized reader accepts Playwright single username argument and uses browser document', () => {
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    assert.deepEqual(readThreadDocument('shop_demo'), { status: 'not_ready', thread: null, messages: [] });
  } finally { globalThis.document = previous; }
});
