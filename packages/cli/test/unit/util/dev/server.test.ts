import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { frameworkList } from '@vercel/frameworks';
import DevServer from '../../../../src/util/dev/server';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    debugEnabled: false,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));

describe('DevServer build filtering', () => {
  it('keeps `api/` builds for every framework runtime when services are not configured', () => {
    const server = new DevServer(process.cwd(), {});
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    const frameworkRuntimes = new Set(
      frameworkList.map(f => f.useRuntime?.use).filter(Boolean)
    );

    expect(frameworkRuntimes.size).toBeGreaterThan(0);
    for (const use of frameworkRuntimes) {
      expect(
        shouldBuildInDev({ use: use as string, src: 'api/handler.rs' })
      ).toBe(true);
    }
  });

  it('filters framework builds that are not in the `api/` directory', () => {
    const server = new DevServer(process.cwd(), {});
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    expect(shouldBuildInDev({ use: '@vercel/next', src: 'package.json' })).toBe(
      false
    );
    expect(shouldBuildInDev({ use: '@vercel/rust', src: 'src/main.rs' })).toBe(
      false
    );
  });

  it('keeps versioned `api/` builds with a leading "./" in `src`', () => {
    const server = new DevServer(process.cwd(), {});
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    expect(
      shouldBuildInDev({ use: '@vercel/rust@1.4.0', src: './api/simple.rs' })
    ).toBe(true);
  });

  it('keeps the previous filtering behavior in services mode', () => {
    const server = new DevServer(process.cwd(), {
      services: [{ name: 'rust-api' }],
    } as any);
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    expect(
      shouldBuildInDev({ use: '@vercel/rust', src: 'api/simple.rs' })
    ).toBe(false);
    expect(shouldBuildInDev({ use: '@vercel/node', src: 'api/date.js' })).toBe(
      true
    );
  });

  it('keeps only the top-level proxy build in services mode', async () => {
    const cwd = join(__dirname, '../../../fixtures/unit/commands/build/proxy');
    const server = new DevServer(cwd, {
      services: [{}],
    } as any);
    (server as any).sidecars = [];
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).validateVercelConfig = vi.fn();
    (server as any).readJsonFile = vi.fn(async (name: string) => {
      if (name === 'package.json') {
        return null;
      }
      return {
        version: 2,
        projectSettings: { framework: 'services' },
        proxy: { entrypoint: 'proxy.ts', matcher: '/api/:func*' },
        services: {
          api: {
            root: '.',
            runtime: 'node',
            entrypoint: 'middleware.ts',
          },
        },
      };
    });

    const config = await server._getVercelConfig();

    expect(config.builds).toEqual([
      {
        src: 'proxy.ts',
        use: '@vercel/node@latest',
        config: {
          zeroConfig: true,
          middleware: true,
          middlewareRuntime: 'nodejs',
          middlewareMatcher: '/api/:func*',
        },
      },
    ]);
  });
});

describe('DevServer queue routes', () => {
  it('forwards the VQS idempotency key to the queue broker', async () => {
    const server = new DevServer(process.cwd(), {});
    const enqueue = vi.fn().mockReturnValue({ messageId: 'message-id' });
    (server as any).queueBroker = { enqueue };

    const req = Readable.from([
      Buffer.from('{"attempt":1}'),
    ]) as IncomingMessage;
    req.method = 'POST';
    req.headers = {
      'content-type': 'application/json',
      'vqs-idempotency-key': 'order-123',
      'vqs-retention-seconds': '120',
      'vqs-delay-seconds': '5',
    };
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await (server as any).handleQueuesRoute(
      req,
      res,
      '/_svc/_queues/api/v3/topic/orders'
    );

    expect(enqueue).toHaveBeenCalledWith(
      'orders',
      Buffer.from('{"attempt":1}'),
      'application/json',
      {
        retentionSeconds: 120,
        delaySeconds: 5,
        idempotencyKey: 'order-123',
      }
    );
    expect(res.writeHead).toHaveBeenCalledWith(201, {
      'Content-Type': 'application/json',
      'Vqs-Message-Id': 'message-id',
    });
  });

  it('redirects duplicate message IDs to the original message ID', async () => {
    const server = new DevServer(process.cwd(), {});
    const getOriginalMessageIdForDuplicate = vi
      .fn()
      .mockReturnValue('original-message-id');
    const receiveById = vi.fn();
    (server as any).queueBroker = {
      getOriginalMessageIdForDuplicate,
      receiveById,
    };

    const req = Readable.from([]) as IncomingMessage;
    req.method = 'POST';
    req.headers = {};
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await (server as any).handleQueuesRoute(
      req,
      res,
      '/_svc/_queues/api/v3/topic/orders/consumer/worker/id/duplicate-message-id'
    );

    expect(getOriginalMessageIdForDuplicate).toHaveBeenCalledWith(
      'orders',
      'duplicate-message-id'
    );
    expect(receiveById).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(409, {
      'Content-Type': 'application/json',
    });
    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({
        error: 'This messageId was a duplicate - use originalMessageId instead',
        originalMessageId: 'original-message-id',
      })
    );
  });
});
