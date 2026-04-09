import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Socket } from 'net';
import { IncomingMessage } from 'http';
import { SYMBOL_FOR_REQ_CONTEXT } from '../../src/get-context';
import { upgradeWebSocket } from '../../src/websocket';

const g = globalThis as typeof globalThis & {
  [SYMBOL_FOR_REQ_CONTEXT]?: unknown;
};

beforeEach(() => {
  delete g[SYMBOL_FOR_REQ_CONTEXT];
});

describe('upgradeWebSocket', () => {
  describe('runtime support', () => {
    test('throws when runtime does not provide upgradeWebSocket', () => {
      g[SYMBOL_FOR_REQ_CONTEXT] = { get: () => ({}) };

      expect(() => upgradeWebSocket()).toThrow(
        'upgradeWebSocket is not available in the current runtime environment'
      );
    });

    test('throws when context is empty', () => {
      expect(() => upgradeWebSocket()).toThrow(
        'upgradeWebSocket is not available in the current runtime environment'
      );
    });
  });

  describe('delegation', () => {
    test('calls context upgradeWebSocket and returns a WebSocket instance', () => {
      const socket = new Socket();
      const req = new IncomingMessage(socket);
      req.method = 'GET';
      req.headers['upgrade'] = 'websocket';
      req.headers['connection'] = 'Upgrade';
      req.headers['sec-websocket-key'] = 'dGhlIHNhbXBsZSBub25jZQ==';
      req.headers['sec-websocket-version'] = '13';

      const mockUpgrade = vi.fn().mockReturnValue({
        req,
        socket,
        head: Buffer.alloc(0),
      });

      g[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ upgradeWebSocket: mockUpgrade }),
      };

      const ws = upgradeWebSocket();

      expect(mockUpgrade).toHaveBeenCalled();
      expect(ws).toBeDefined();
      expect(typeof ws.send).toBe('function');
      expect(typeof ws.close).toBe('function');
      expect(typeof ws.on).toBe('function');

      // Clean up
      socket.destroy();
    });
  });
});
