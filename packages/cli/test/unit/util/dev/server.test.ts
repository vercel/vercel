import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';
import DevServer from '../../../../src/util/dev/server';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    debugEnabled: false,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

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
