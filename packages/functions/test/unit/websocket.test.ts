import { Buffer } from 'node:buffer';
import { PassThrough } from 'node:stream';

import { afterEach, expect, test, vi } from 'vitest';

import { SYMBOL_FOR_REQ_CONTEXT } from '../../src/get-context';
import {
  getWebSocketUpgrade,
  type WebSocketUpgrade,
} from '../../src/websocket';

afterEach(() => {
  delete globalThis[SYMBOL_FOR_REQ_CONTEXT];
});

test.each([
  null,
  undefined,
  {},
  { get: undefined },
  { get: () => ({}) },
])('getWebSocketUpgrade returns undefined when context is %s', input => {
  globalThis[SYMBOL_FOR_REQ_CONTEXT] = input;
  expect(getWebSocketUpgrade()).toBeUndefined();
});

test('getWebSocketUpgrade returns the runtime upgrade primitives when available', () => {
  const upgrade: WebSocketUpgrade = {
    req: {} as WebSocketUpgrade['req'],
    socket: new PassThrough(),
    head: Buffer.alloc(0),
  };
  const upgradeWebSocket = vi.fn(() => upgrade);

  globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
    get: () => ({ upgradeWebSocket }),
  };

  expect(getWebSocketUpgrade()).toBe(upgrade);
  expect(upgradeWebSocket).toHaveBeenCalledOnce();
});
