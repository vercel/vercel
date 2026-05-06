import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Service } from '@vercel/fs-detectors';
import {
  QueueBroker,
  topicPatternToRegex,
} from '../../../../src/util/dev/queue-broker';

vi.mock('../../../../src/output-manager', () => ({
  default: { debug: vi.fn(), debugEnabled: false },
}));

vi.mock('node-fetch', () => ({
  default: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

import nodeFetch from 'node-fetch';
const mockFetch = vi.mocked(nodeFetch);

function makeWorkerService(
  name: string,
  topics: string[] = ['default']
): Service {
  return {
    name,
    type: 'worker',
    consumer: name,
    workspace: '.',
    builder: { src: 'index.ts', use: '@vercel/node' },
    topics,
  } as Service;
}

function makeQueueJobService(
  name: string,
  topics: Array<{
    topic: string;
    retryAfterSeconds?: number;
    initialDelaySeconds?: number;
  }>
): Service {
  return {
    name,
    type: 'job',
    trigger: 'queue',
    workspace: '.',
    builder: { src: 'index.ts', use: '@vercel/node' },
    topics,
  } as Service;
}

function makeWebService(name: string): Service {
  return {
    name,
    type: 'web',
    routePrefix: '/',
    workspace: '.',
    builder: { src: 'index.ts', use: '@vercel/node' },
  } as Service;
}

/** Extract headers from a specific mockFetch call (defaults to the last one). */
function callHeaders(index?: number): Record<string, string> {
  const i = index ?? mockFetch.mock.calls.length - 1;
  const call = mockFetch.mock.calls[i];
  return (call[1] as any).headers;
}

describe('topicPatternToRegex', () => {
  it('matches exact topic names', () => {
    const re = topicPatternToRegex('orders');
    expect(re.test('orders')).toBe(true);
    expect(re.test('orders-new')).toBe(false);
    expect(re.test('my-orders')).toBe(false);
  });

  it('matches wildcard at end', () => {
    const re = topicPatternToRegex('order-*');
    expect(re.test('order-')).toBe(true);
    expect(re.test('order-new')).toBe(true);
    expect(re.test('order-new-item')).toBe(true);
    expect(re.test('orders')).toBe(false);
  });

  it('matches wildcard at start', () => {
    const re = topicPatternToRegex('*-events');
    expect(re.test('-events')).toBe(true);
    expect(re.test('user-events')).toBe(true);
    expect(re.test('events')).toBe(false);
  });

  it('matches wildcard in middle', () => {
    const re = topicPatternToRegex('app-*-events');
    expect(re.test('app--events')).toBe(true);
    expect(re.test('app-user-events')).toBe(true);
    expect(re.test('app-events')).toBe(false);
  });

  it('matches standalone wildcard', () => {
    const re = topicPatternToRegex('*');
    expect(re.test('')).toBe(true);
    expect(re.test('anything')).toBe(true);
    expect(re.test('multi-word_test')).toBe(true);
  });

  it('only matches valid topic characters in wildcard', () => {
    const re = topicPatternToRegex('prefix-*');
    expect(re.test('prefix-valid_name-123')).toBe(true);
    expect(re.test('prefix-has space')).toBe(false);
    expect(re.test('prefix-has.dot')).toBe(false);
  });
});

describe('QueueBroker', () => {
  let broker: QueueBroker;
  let getServiceOrigin: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as any);
    getServiceOrigin = vi.fn().mockReturnValue('http://localhost:3001');
  });

  afterEach(() => {
    broker?.stop();
    vi.useRealTimers();
  });

  describe('enqueue', () => {
    it('returns unique messageIds', () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const r1 = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      const r2 = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );

      expect(r1.messageId).toBeTruthy();
      expect(r2.messageId).toBeTruthy();
      expect(r1.messageId).not.toBe(r2.messageId);
    });

    it('dispatches CloudEvent to matching worker', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/');
      expect((opts as any).method).toBe('POST');

      const headers = callHeaders();
      expect(headers['ce-type']).toBe('com.vercel.queue.v2beta');
      expect(headers['ce-vqsqueuename']).toBe('orders');
      expect(headers['ce-vqsconsumergroup']).toBe('worker-a');
      expect(headers['ce-vqsmessageid']).toBe(messageId);
      expect(headers['ce-vqsreceipthandle']).toBeTruthy();
      expect(headers['content-type']).toBe('application/json');
    });

    it('dispatches to multiple matching consumer groups', async () => {
      broker = new QueueBroker(
        [
          makeWorkerService('worker-a', ['order-*']),
          makeWorkerService('worker-b', ['order-created']),
        ],
        getServiceOrigin
      );

      broker.enqueue('order-created', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('dispatches to worker subscribed to multiple topics via topics[]', async () => {
      broker = new QueueBroker(
        [makeWorkerService('multi-worker', ['orders', 'events'])],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{"a":1}'), 'application/json');
      broker.enqueue('events', Buffer.from('{"b":2}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      expect(callHeaders(0)['ce-vqsqueuename']).toBe('orders');
      expect(callHeaders(1)['ce-vqsqueuename']).toBe('events');
    });

    it('does not cross-dispatch across topics during tick()', async () => {
      broker = new QueueBroker(
        [makeWorkerService('multi-worker', ['orders', 'events'])],
        getServiceOrigin
      );

      broker.enqueue(
        'orders',
        Buffer.from('{"t":"orders"}'),
        'application/json',
        {
          delaySeconds: 5,
        }
      );
      broker.enqueue(
        'events',
        Buffer.from('{"t":"events"}'),
        'application/json',
        {
          delaySeconds: 5,
        }
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(6_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not dispatch on unmatched topic when using topics[]', async () => {
      broker = new QueueBroker(
        [makeWorkerService('multi-worker', ['orders', 'events'])],
        getServiceOrigin
      );

      broker.enqueue('unmatched', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not dispatch when no consumer matches', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      broker.enqueue('unmatched-topic', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('ignores non-worker services', async () => {
      broker = new QueueBroker([makeWebService('frontend')], getServiceOrigin);

      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('dispatches queue-triggered job services and respects topic timing config', async () => {
      broker = new QueueBroker(
        [
          makeQueueJobService('processor', [
            {
              topic: 'orders',
              retryAfterSeconds: 30,
              initialDelaySeconds: 5,
            },
          ]),
        ],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(4_000);
      expect(mockFetch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2_000);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('processor');
    });

    it('does not dispatch delayed messages immediately', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{}'), 'application/json', {
        delaySeconds: 5,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('dispatches delayed messages after the delay passes', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{}'), 'application/json', {
        delaySeconds: 5,
      });

      // Tick fires at 1s intervals; at 6s the message should be visible
      await vi.advanceTimersByTimeAsync(6_000);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('receiveById', () => {
    it('returns payload and metadata for an enqueued message', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const payload = Buffer.from('{"item":"book"}');
      const { messageId } = broker.enqueue('orders', payload, 'text/plain');
      await vi.advanceTimersByTimeAsync(0);

      const result = broker.receiveById(messageId, 'worker-a');
      expect(result).not.toBeNull();
      expect(result!.payload).toEqual(payload);
      expect(result!.contentType).toBe('text/plain');
      expect(result!.receiptHandle).toBeTruthy();
      expect(result!.deliveryCount).toBe(1);
      expect(result!.createdAt).toBeTruthy();
    });

    it('returns null for non-existent message', () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      expect(broker.receiveById('nonexistent', 'worker-a')).toBeNull();
    });

    it('returns null for unknown consumer group', () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('test'),
        'text/plain'
      );

      expect(broker.receiveById(messageId, 'unknown-group')).toBeNull();
    });
  });

  describe('acknowledge', () => {
    it('returns true and makes message unreceivable in that group', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      const received = broker.receiveById(messageId, 'worker-a')!;
      const acked = broker.acknowledge(
        messageId,
        'worker-a',
        received.receiptHandle
      );
      expect(acked).toBe(true);

      // After ACK, receiveById for this group returns fresh data (no tracked state)
      // but a second ACK should fail since delivery state was removed
      const secondAck = broker.acknowledge(
        messageId,
        'worker-a',
        received.receiptHandle
      );
      expect(secondAck).toBe(false);
    });

    it('rejects ACK with wrong receipt handle', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      const result = broker.acknowledge(
        messageId,
        'worker-a',
        'wrong-receipt-handle'
      );
      expect(result).toBe(false);

      // Message should still be receivable
      const received = broker.receiveById(messageId, 'worker-a');
      expect(received).not.toBeNull();
    });

    it('returns false for unknown consumer group', () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      expect(broker.acknowledge('any', 'unknown-group', 'receipt-handle')).toBe(
        false
      );
    });

    it('cleans up message when acked in all groups', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      const handle = broker.receiveById(messageId, 'worker-a')!.receiptHandle;
      broker.acknowledge(messageId, 'worker-a', handle);

      // Message no longer exists at all
      expect(broker.receiveById(messageId, 'worker-a')).toBeNull();
    });

    it('keeps message receivable in other groups after partial ACK', async () => {
      broker = new QueueBroker(
        [
          makeWorkerService('worker-a', ['order-*']),
          makeWorkerService('worker-b', ['order-*']),
        ],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'order-created',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      // ACK in group A
      const handleA = broker.receiveById(messageId, 'worker-a')!.receiptHandle;
      broker.acknowledge(messageId, 'worker-a', handleA);

      // Still available in group B
      const resultB = broker.receiveById(messageId, 'worker-b');
      expect(resultB).not.toBeNull();
    });
  });

  describe('changeVisibility', () => {
    it('returns true for in-flight message with valid receipt handle', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      const handle = broker.receiveById(messageId, 'worker-a')!.receiptHandle;
      const result = broker.changeVisibility(
        messageId,
        'worker-a',
        handle,
        300
      );
      expect(result).toBe(true);
    });

    it('returns false for pending message', () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json',
        { delaySeconds: 999 }
      );

      expect(broker.changeVisibility(messageId, 'worker-a', '', 60)).toBe(
        false
      );
    });

    it('returns false with wrong receipt handle', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(
        broker.changeVisibility(
          messageId,
          'worker-a',
          'wrong-receipt-handle',
          60
        )
      ).toBe(false);
    });

    it('prevents lease expiry when visibility is extended', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);
      mockFetch.mockClear();

      const handle = broker.receiveById(messageId, 'worker-a')!.receiptHandle;

      // Extend visibility to 5 minutes
      broker.changeVisibility(messageId, 'worker-a', handle, 300);

      // Advance past original 60s timeout but within new 300s timeout
      await vi.advanceTimersByTimeAsync(90_000);

      // Should NOT have retried — message is still in-flight
      expect(mockFetch).not.toHaveBeenCalled();

      // Should still be acknowledgeable with the same receipt handle
      expect(broker.acknowledge(messageId, 'worker-a', handle)).toBe(true);
    });
  });

  describe('retry on failure', () => {
    it('retries after fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      // First attempt failed
      expect(mockFetch).toHaveBeenCalledOnce();

      // Message should still be receivable (went back to pending)
      const received = broker.receiveById(messageId, 'worker-a');
      expect(received).not.toBeNull();

      // Advance past retry delay (60s) + tick
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as any);
      await vi.advanceTimersByTimeAsync(61_000);

      // Should have retried
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries after non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as any);

      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledOnce();

      mockFetch.mockResolvedValue({ ok: true, status: 200 } as any);
      await vi.advanceTimersByTimeAsync(61_000);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries when service origin is initially null', async () => {
      getServiceOrigin.mockReturnValue(null);

      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      // No fetch — service wasn't available
      expect(mockFetch).not.toHaveBeenCalled();

      // Service becomes available
      getServiceOrigin.mockReturnValue('http://localhost:3001');
      await vi.advanceTimersByTimeAsync(61_000);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('lease expiry', () => {
    it('re-dispatches message when visibility timeout expires', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledOnce();
      mockFetch.mockClear();

      // Advance past visibility timeout (60s) + retry delay (60s) + tick
      await vi.advanceTimersByTimeAsync(121_000);

      // Should have re-dispatched
      expect(mockFetch).toHaveBeenCalled();
    });

    it('increments delivery count on re-dispatch', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      // First delivery
      const first = broker.receiveById(messageId, 'worker-a');
      expect(first!.deliveryCount).toBe(1);

      // Expire lease + retry delay + tick → re-dispatch
      await vi.advanceTimersByTimeAsync(121_000);

      // Second delivery
      const second = broker.receiveById(messageId, 'worker-a');
      expect(second!.deliveryCount).toBe(2);
    });
  });

  describe('message retention', () => {
    it('cleans up expired messages', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json',
        { retentionSeconds: 10 }
      );
      await vi.advanceTimersByTimeAsync(0);

      // Message receivable before expiry
      expect(broker.receiveById(messageId, 'worker-a')).not.toBeNull();

      // Advance past retention
      await vi.advanceTimersByTimeAsync(11_000);

      // Message gone
      expect(broker.receiveById(messageId, 'worker-a')).toBeNull();
    });
  });

  describe('multiple messages', () => {
    it('dispatches all messages immediately without queuing', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      broker.enqueue('orders', Buffer.from('{"n":1}'), 'application/json');
      broker.enqueue('orders', Buffer.from('{"n":2}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
