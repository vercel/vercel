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
  describe('input validation', () => {
    test.each([
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
      ['a string', 'not a request'],
    ])('throws TypeError when called with %s', (_, input) => {
      expect(() => upgradeWebSocket(input as unknown as Request)).toThrow(
        TypeError
      );
    });
  });

  describe('runtime support', () => {
    test('throws when runtime does not provide upgradeWebSocket', () => {
      g[SYMBOL_FOR_REQ_CONTEXT] = { get: () => ({}) };

      const request = new Request('http://localhost', {
        headers: { Upgrade: 'websocket' },
      });

      expect(() => upgradeWebSocket(request)).toThrow(
        'upgradeWebSocket is not available in the current runtime environment'
      );
    });

    test('throws when context is empty', () => {
      const request = new Request('http://localhost');

      expect(() => upgradeWebSocket(request)).toThrow(
        'upgradeWebSocket is not available in the current runtime environment'
      );
    });
  });

  describe('delegation', () => {
    test('calls context upgradeWebSocket and returns ws socket + response', () => {
      // Create a real socket pair so ws can operate on it
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

      const request = new Request('http://localhost', {
        headers: { Upgrade: 'websocket' },
      });

      const result = upgradeWebSocket(request);

      expect(mockUpgrade).toHaveBeenCalled();
      expect(result.socket).toBeDefined();
      expect(typeof result.socket.send).toBe('function');
      expect(typeof result.socket.close).toBe('function');

      // Clean up
      socket.destroy();
    });
  });
});
