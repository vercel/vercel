import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Duplex } from 'stream';
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
    test('calls context upgradeWebSocket and returns socket + response', () => {
      const mockSocket = new Duplex({
        read() {},
        write(_, __, cb) {
          cb();
        },
      });
      const mockUpgrade = vi.fn().mockReturnValue(mockSocket);

      g[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => ({ upgradeWebSocket: mockUpgrade }),
      };

      const request = new Request('http://localhost', {
        headers: { Upgrade: 'websocket' },
      });

      const result = upgradeWebSocket(request);

      expect(mockUpgrade).toHaveBeenCalled();
      expect(result.socket).toBe(mockSocket);
      expect(result.response.status).toBe(101);
      expect(result.response.statusText).toBe('Switching Protocols');
    });
  });
});
