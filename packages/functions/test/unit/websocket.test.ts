import { describe, expect, test, vi, beforeEach } from 'vitest';
import { Socket } from 'net';
import { IncomingMessage } from 'http';
import { SYMBOL_FOR_REQ_CONTEXT } from '../../src/get-context';
import { experimental_upgradeWebSocket } from '../../src/websocket';

const { webSocketServerOptions } = vi.hoisted(() => ({
  webSocketServerOptions: [] as Array<Record<string, unknown> | undefined>,
}));

vi.mock('ws', async importOriginal => {
  const actual = await importOriginal<typeof import('ws')>();

  class TestWebSocketServer extends actual.WebSocketServer {
    constructor(options?: unknown, callback?: unknown) {
      webSocketServerOptions.push(
        options as Record<string, unknown> | undefined
      );

      super(
        options as ConstructorParameters<typeof actual.WebSocketServer>[0],
        callback as ConstructorParameters<typeof actual.WebSocketServer>[1]
      );
    }
  }

  return {
    ...actual,
    WebSocketServer: TestWebSocketServer,
  };
});

const g = globalThis as typeof globalThis & {
  [SYMBOL_FOR_REQ_CONTEXT]?: unknown;
};

beforeEach(() => {
  delete g[SYMBOL_FOR_REQ_CONTEXT];
  webSocketServerOptions.length = 0;
});

describe('experimental_upgradeWebSocket', () => {
  describe('runtime support', () => {
    test('throws when runtime does not provide upgradeWebSocket', async () => {
      g[SYMBOL_FOR_REQ_CONTEXT] = { get: () => ({}) };

      await expect(experimental_upgradeWebSocket(() => {})).rejects.toThrow(
        'experimental_upgradeWebSocket is not available in the current runtime environment'
      );
    });

    test('throws when context is empty', async () => {
      await expect(experimental_upgradeWebSocket(() => {})).rejects.toThrow(
        'experimental_upgradeWebSocket is not available in the current runtime environment'
      );
    });
  });

  describe('delegation', () => {
    const createUpgradeContext = () => {
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

      return { mockUpgrade, socket };
    };

    test('calls handler with a WebSocket instance and returns a route response', async () => {
      const { mockUpgrade, socket } = createUpgradeContext();
      const handler = vi.fn();

      const response = await experimental_upgradeWebSocket(handler);

      expect(mockUpgrade).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(typeof handler.mock.calls[0][0].send).toBe('function');
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(204);
      expect(webSocketServerOptions).toEqual([
        { noServer: true, maxPayload: 256 * 1024 },
      ]);

      socket.destroy();
    });

    test('passes maxPayload to the WebSocket server when provided', async () => {
      const { socket } = createUpgradeContext();

      const response = await experimental_upgradeWebSocket(() => {}, {
        maxPayload: 256 * 1024,
      });

      expect(response.status).toBe(204);
      expect(webSocketServerOptions).toEqual([
        { noServer: true, maxPayload: 256 * 1024 },
      ]);

      socket.destroy();
    });

    test('uses the default maxPayload when undefined', async () => {
      const { socket } = createUpgradeContext();

      const response = await experimental_upgradeWebSocket(() => {}, {
        maxPayload: undefined,
      });

      expect(response.status).toBe(204);
      expect(webSocketServerOptions).toEqual([
        { noServer: true, maxPayload: 256 * 1024 },
      ]);

      socket.destroy();
    });

    test('closes the WebSocket when the handler throws', async () => {
      const { socket } = createUpgradeContext();
      const error = new Error('boom');
      let close: ReturnType<typeof vi.spyOn> | undefined;

      await expect(
        experimental_upgradeWebSocket(ws => {
          close = vi.spyOn(ws, 'close');
          throw error;
        })
      ).rejects.toThrow(error);

      expect(close).toHaveBeenCalledWith(1011, 'WebSocket handler failed');

      socket.destroy();
    });
  });
});
