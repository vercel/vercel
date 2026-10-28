import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type {
  ExperimentalService,
  ServiceQueueTopic,
  ServiceTopics,
} from '@vercel/build-utils';
import {
  QueueBroker,
  type FunctionQueueSubscription,
  type FunctionDispatch,
  topicPatternToRegex,
} from '../../../../src/util/dev/queue-broker';

vi.mock('../../../../src/output-manager', () => ({
  default: { debug: vi.fn(), debugEnabled: false },
}));

vi.mock('../../../../src/util/fetch', () => ({
  directFetch: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

import { directFetch } from '../../../../src/util/fetch';
const mockFetch = vi.mocked(directFetch);

function makeWorkerService(
  name: string,
  topics: ServiceTopics = ['default']
): ExperimentalService {
  return {
    schema: 'experimentalServices',
    name,
    type: 'worker',
    workspace: '.',
    builder: { src: 'index.ts', use: '@vercel/node' },
    topics,
  } as ExperimentalService;
}

function makeQueueJobService(
  name: string,
  topics: ServiceQueueTopic[]
): ExperimentalService {
  return {
    schema: 'experimentalServices',
    name,
    type: 'job',
    trigger: 'queue',
    workspace: '.',
    builder: { src: 'index.ts', use: '@vercel/node' },
    topics,
  } as ExperimentalService;
}

function makeWebService(name: string): ExperimentalService {
  return {
    schema: 'experimentalServices',
    name,
    type: 'web',
    routePrefix: '/',
    workspace: '.',
    builder: { src: 'index.ts', use: '@vercel/node' },
  } as ExperimentalService;
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
  let getServiceOrigin: Mock<(name: string) => string | null>;

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

  describe('configured function subscriptions', () => {
    function resolveFunction(outputPath: string) {
      const origin = getServiceOrigin(outputPath);
      return origin
        ? (request: Parameters<typeof directFetch>[1]) =>
            directFetch(`${origin}/${outputPath}`, request)
        : null;
    }
    const subscription: FunctionQueueSubscription = {
      consumer: 'api_Sjobs_Dts',
      topic: 'orders',
      outputPath: 'api/jobs',
    };

    it('dispatches to each configured path with its own consumer headers', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.setFunctionSubscriptions(
        [
          subscription,
          { ...subscription, consumer: 'audit', outputPath: 'api/audit' },
        ],
        resolveFunction
      );
      const payload = Buffer.from('{"value":42}');
      const { messageId } = broker.enqueue(
        'orders',
        payload,
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
        'http://localhost:3001/api/jobs',
        'http://localhost:3001/api/audit',
      ]);
      expect(getServiceOrigin).toHaveBeenCalledWith('api/jobs');
      expect(callHeaders(0)).toMatchObject({
        'ce-type': 'com.vercel.queue.v2beta',
        'ce-source': `/topic/orders/consumer/${subscription.consumer}`,
        'ce-vqsconsumergroup': subscription.consumer,
        'ce-vqsmessageid': messageId,
        'ce-vqsdeliverycount': '1',
        'ce-vqsregion': 'dev1',
        'content-type': 'application/json',
      });
      expect(callHeaders(0)['ce-vqsreceipthandle']).toBeTruthy();
      expect(mockFetch.mock.calls[0][1]?.body).toBe(payload);
      expect(callHeaders(1)['ce-vqsconsumergroup']).toBe('audit');
    });

    it('delivers retained early messages once the framework is ready', async () => {
      getServiceOrigin.mockReturnValue(null);
      broker = new QueueBroker([], getServiceOrigin);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch).not.toHaveBeenCalled();

      getServiceOrigin.mockReturnValue('http://localhost:4001');
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:4001/api/jobs');
      expect(callHeaders()).toMatchObject({
        'ce-vqsmessageid': messageId,
        'ce-vqsdeliverycount': '1',
      });
    });

    it('keeps ACKs and active leases across identical and tuning reloads', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      const acked = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      const active = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);
      const receipt = callHeaders(1)['ce-vqsreceipthandle'];
      expect(
        broker.acknowledge(
          acked.messageId,
          subscription.consumer,
          callHeaders(0)['ce-vqsreceipthandle']
        )
      ).toBe(true);
      expect(
        broker.changeVisibility(
          active.messageId,
          subscription.consumer,
          receipt,
          120
        )
      ).toBe(true);

      broker.setFunctionSubscriptions([subscription], resolveFunction);
      broker.setFunctionSubscriptions(
        [{ ...subscription, retryAfterSeconds: 2 }],
        resolveFunction
      );
      await vi.advanceTimersByTimeAsync(65_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(
        broker.receiveById('orders', acked.messageId, subscription.consumer)
      ).toBeNull();
      expect(
        broker.receiveById('orders', active.messageId, subscription.consumer)
          ?.receiptHandle
      ).toBe(receipt);
    });

    it('restores an attempt deferred while a target was starting and retries without spending a delivery', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      const dispatch = vi
        .fn<FunctionDispatch>()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ ok: true, status: 200 });
      broker.setFunctionSubscriptions([subscription], () => dispatch);
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(
        dispatch.mock.calls.map(([req]) => req.headers['ce-vqsdeliverycount'])
      ).toEqual(['1', '1']);
      await vi.advanceTimersByTimeAsync(1000);
      expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it('does not overwrite a newer polling lease when a removed target finishes deferring', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      let finish!: (result: null) => void;
      const dispatch: FunctionDispatch = () =>
        new Promise(resolve => {
          finish = resolve;
        });
      broker.setFunctionSubscriptions([subscription], () => dispatch);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      broker.setFunctionSubscriptions([], resolveFunction);
      await vi.advanceTimersByTimeAsync(60_000);
      const [polled] = broker.receiveMessages('orders', subscription.consumer);
      finish(null);
      await vi.advanceTimersByTimeAsync(0);
      expect(
        broker.changeVisibility(
          messageId,
          subscription.consumer,
          polled.receiptHandle,
          120
        )
      ).toBe(true);
      expect(
        broker.receiveById('orders', messageId, subscription.consumer)
          ?.deliveryCount
      ).toBe(2);
    });

    it('updates the callback path without replaying an acknowledged message', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);
      broker.acknowledge(
        messageId,
        subscription.consumer,
        callHeaders()['ce-vqsreceipthandle']
      );
      broker.setFunctionSubscriptions(
        [{ ...subscription, outputPath: 'api/new' }],
        resolveFunction
      );
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:3001/api/new');
    });

    it('removes push registrations while preserving polling state and unrelated services', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker', ['other'])],
        getServiceOrigin
      );
      const acked = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      const [polled] = broker.receiveMessages('orders', subscription.consumer);
      broker.acknowledge(
        acked.messageId,
        subscription.consumer,
        polled.receiptHandle
      );
      const active = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      const [leased] = broker.receiveMessages('orders', subscription.consumer, {
        visibilityTimeoutSeconds: 120,
      });

      broker.setFunctionSubscriptions([subscription], resolveFunction);
      broker.setFunctionSubscriptions([], resolveFunction);
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(
        broker.receiveById('orders', active.messageId, subscription.consumer)
          ?.receiptHandle
      ).toBe(leased.receiptHandle);

      const pending = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).not.toHaveBeenCalled();
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(callHeaders()['ce-vqsmessageid']).toBe(pending.messageId);
      broker.enqueue('other', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:3001/');
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('worker');
    });

    it('validates ownership collisions before applying any configuration changes', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker', ['orders'])],
        getServiceOrigin
      );
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      expect(() =>
        broker.setFunctionSubscriptions(
          [
            { ...subscription, consumer: 'new' },
            { ...subscription, consumer: 'worker' },
          ],
          resolveFunction
        )
      ).toThrow('configured more than once');
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(
        mockFetch.mock.calls.map(
          (_, i) => callHeaders(i)['ce-vqsconsumergroup']
        )
      ).toEqual(['worker', subscription.consumer]);
    });

    it('rejects duplicate input before adding any registrations', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      expect(() =>
        broker.setFunctionSubscriptions(
          [subscription, subscription],
          resolveFunction
        )
      ).toThrow('configured more than once');
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not let service registration or introspection steal configured consumers', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker', ['other'])],
        getServiceOrigin
      );
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      expect(() =>
        broker.registerServices([
          makeWorkerService('new', ['orders']),
          {
            ...makeWorkerService('collision', ['orders']),
            consumer: subscription.consumer,
          },
        ])
      ).toThrow('configured more than once');
      expect(() =>
        broker.updateServiceSubscriptions('worker', [
          subscription,
          { consumer: 'worker', topic: 'other' },
        ])
      ).not.toThrow();
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      broker.enqueue('other', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(
        mockFetch.mock.calls.map(
          (_, i) => callHeaders(i)['ce-vqsconsumergroup']
        )
      ).toEqual([subscription.consumer, 'worker']);
    });

    it('keeps first runtime registrations without throwing after a worker starts', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.updateServiceSubscriptions('first-worker', [
        { consumer: 'shared', topic: 'orders' },
      ]);
      expect(() =>
        broker.updateServiceSubscriptions('second-worker', [
          { consumer: 'shared', topic: 'orders' },
          { consumer: 'second', topic: 'orders' },
          { consumer: 'second', topic: 'orders' },
        ])
      ).not.toThrow();
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(callHeaders(0)['ce-vqsconsumergroup']).toBe('shared');
      expect(callHeaders(1)['ce-vqsconsumergroup']).toBe('second');
      expect(getServiceOrigin.mock.calls).toEqual([
        ['first-worker'],
        ['second-worker'],
      ]);
    });

    it('retains runtime-introspected consumers on config removal', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.updateServiceSubscriptions('worker', [
        { consumer: 'sdk', topic: 'orders' },
      ]);
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      broker.setFunctionSubscriptions([], resolveFunction);
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('sdk');
    });

    it('honors configured initial delay, retry timing and delivery limit', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as any);
      broker.setFunctionSubscriptions(
        [
          {
            ...subscription,
            initialDelaySeconds: 2,
            retryAfterSeconds: 3,
            maxDeliveries: 2,
          },
        ],
        resolveFunction
      );
      await vi.advanceTimersByTimeAsync(1999);
      expect(mockFetch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(callHeaders()['ce-vqsdeliverycount']).toBe('2');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale callback failure after the polling lease has changed', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      let finish!: (response: any) => void;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      broker.setFunctionSubscriptions([subscription], resolveFunction);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      broker.setFunctionSubscriptions([], resolveFunction);
      await vi.advanceTimersByTimeAsync(60_000);
      const [polled] = broker.receiveMessages('orders', subscription.consumer);
      finish({ ok: false, status: 500 });
      await vi.advanceTimersByTimeAsync(0);
      expect(
        broker.changeVisibility(
          messageId,
          subscription.consumer,
          polled.receiptHandle,
          120
        )
      ).toBe(true);
    });
  });

  it('rejects duplicate consumer and topic pairs', () => {
    expect(
      () =>
        new QueueBroker(
          [
            {
              ...makeWorkerService('worker-a', ['jobs']),
              consumer: 'shared-consumer',
            },
            {
              ...makeWorkerService('worker-b', ['jobs']),
              consumer: 'shared-consumer',
            },
          ],
          getServiceOrigin
        )
    ).toThrow(
      'Queue consumer "shared-consumer" is configured more than once for topic "jobs"'
    );
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

    it('deduplicates idempotency keys within a queue', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const first = broker.enqueue(
        'orders',
        Buffer.from('{"attempt":1}'),
        'application/json',
        { idempotencyKey: 'order-123' }
      );
      const duplicate = broker.enqueue(
        'orders',
        Buffer.from('{"attempt":2}'),
        'application/json',
        { idempotencyKey: 'order-123' }
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(duplicate.messageId).not.toBe(first.messageId);
      expect(
        broker.getOriginalMessageIdForDuplicate('orders', duplicate.messageId)
      ).toBe(first.messageId);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect((mockFetch.mock.calls[0][1] as any).body.toString()).toBe(
        '{"attempt":1}'
      );
    });

    it('scopes idempotency keys to a queue', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['*'])],
        getServiceOrigin
      );

      const first = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json',
        { idempotencyKey: 'shared-key' }
      );
      const second = broker.enqueue(
        'events',
        Buffer.from('{}'),
        'application/json',
        { idempotencyKey: 'shared-key' }
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(second.messageId).not.toBe(first.messageId);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('expires idempotency keys with message retention', async () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const first = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json',
        { idempotencyKey: 'expiring-key', retentionSeconds: 60 }
      );
      const duplicate = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json',
        { idempotencyKey: 'expiring-key', retentionSeconds: 60 }
      );

      expect(
        broker.getOriginalMessageIdForDuplicate('orders', duplicate.messageId)
      ).toBe(first.messageId);

      await vi.advanceTimersByTimeAsync(60_001);
      const afterExpiration = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json',
        { idempotencyKey: 'expiring-key', retentionSeconds: 60 }
      );

      expect(
        broker.getOriginalMessageIdForDuplicate(
          'orders',
          afterExpiration.messageId
        )
      ).toBeNull();
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

    it('delivers with introspected consumer groups after an update', async () => {
      broker = new QueueBroker(
        [
          {
            ...makeWorkerService('celery-worker', ['*']),
            consumer: 'synthesized-name',
          },
        ],
        getServiceOrigin
      );

      broker.updateServiceSubscriptions('celery-worker', [
        { topic: 'tasks', consumer: 'sdk-tasks-group' },
        { topic: 'audit-*', consumer: 'sdk-audit-group', retryAfterSeconds: 5 },
      ]);

      broker.enqueue('tasks', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      // The synthesized match-all group was replaced: one delivery, carrying
      // the SDK-registered consumer group.
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(getServiceOrigin).toHaveBeenCalledWith('celery-worker');
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('sdk-tasks-group');

      mockFetch.mockClear();
      broker.enqueue('audit-login', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('sdk-audit-group');

      mockFetch.mockClear();
      broker.enqueue('unrelated', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('delivers retained messages after subscription introspection', async () => {
      getServiceOrigin.mockReturnValue(null);
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['*'])],
        getServiceOrigin
      );
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).not.toHaveBeenCalled();

      getServiceOrigin.mockReturnValue('http://localhost:3001');
      broker.updateServiceSubscriptions('worker-a', [
        { topic: 'orders', consumer: 'orders-consumer' },
      ]);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(callHeaders()['ce-vqsmessageid']).toBe(messageId);
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('orders-consumer');
    });

    it('keeps other services intact when updating one service', async () => {
      broker = new QueueBroker(
        [
          makeWorkerService('worker-a', ['orders']),
          makeWorkerService('worker-b', ['orders']),
        ],
        getServiceOrigin
      );

      broker.updateServiceSubscriptions('worker-a', [
        { topic: 'orders', consumer: 'sdk-orders-group' },
      ]);

      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const consumers = mockFetch.mock.calls.map(
        call => (call[1] as any).headers['ce-vqsconsumergroup']
      );
      expect(consumers).toEqual(
        expect.arrayContaining(['sdk-orders-group', 'worker-b'])
      );
    });

    it('routes by service name while identifying its queue consumer', async () => {
      broker = new QueueBroker(
        [
          {
            ...makeWorkerService('celery-worker', ['tasks']),
            consumer: 'celery-consumer',
          },
        ],
        getServiceOrigin
      );

      broker.enqueue('tasks', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(getServiceOrigin).toHaveBeenCalledWith('celery-worker');
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('celery-consumer');
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

      const result = broker.receiveById('orders', messageId, 'worker-a');
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

      expect(
        broker.receiveById('orders', 'nonexistent', 'worker-a')
      ).toBeNull();
    });

    it('lazily creates an unknown consumer group', () => {
      broker = new QueueBroker(
        [makeWorkerService('worker-a', ['orders'])],
        getServiceOrigin
      );

      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('test'),
        'text/plain'
      );

      const result = broker.receiveById('orders', messageId, 'unknown-group');
      expect(result?.messageId).toBe(messageId);
      expect(result?.receiptHandle).toBeTruthy();
    });

    it('does not receive a message from another topic', () => {
      broker = new QueueBroker([], getServiceOrigin);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('test'),
        'text/plain'
      );

      expect(
        broker.receiveById('events', messageId, 'external-worker')
      ).toBeNull();
    });
  });

  describe('receiveMessages', () => {
    it('creates pull consumer groups at the beginning of a topic', () => {
      broker = new QueueBroker([], getServiceOrigin);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{"item":"book"}'),
        'application/json'
      );

      const firstGroup = broker.receiveMessages('orders', 'fulfillment');
      expect(firstGroup).toHaveLength(1);
      expect(firstGroup[0].messageId).toBe(messageId);
      expect(mockFetch).not.toHaveBeenCalled();

      expect(
        broker.acknowledge(
          messageId,
          'fulfillment',
          firstGroup[0].receiptHandle
        )
      ).toBe(true);
      expect(broker.receiveMessages('orders', 'fulfillment')).toEqual([]);

      const secondGroup = broker.receiveMessages('orders', 'analytics');
      expect(secondGroup).toHaveLength(1);
      expect(secondGroup[0].messageId).toBe(messageId);
    });

    it('delivers messages sent after a pull consumer group is created', () => {
      broker = new QueueBroker([], getServiceOrigin);

      expect(broker.receiveMessages('orders', 'fulfillment')).toEqual([]);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );

      expect(broker.receiveMessages('orders', 'fulfillment')[0].messageId).toBe(
        messageId
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('upgrades a pull consumer group when its push service registers', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.receiveMessages('orders', 'fulfillment');

      broker.registerServices([
        {
          ...makeWorkerService('worker-a', ['orders']),
          consumer: 'fulfillment',
        },
      ]);
      broker.enqueue('orders', Buffer.from('{}'), 'application/json');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(callHeaders()['ce-vqsconsumergroup']).toBe('fulfillment');
    });

    it('pushes retained messages when a service registers', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );

      broker.registerServices([makeWorkerService('worker-a', ['orders'])]);
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(callHeaders()['ce-vqsmessageid']).toBe(messageId);
    });

    it('selects the matching topic for a multi-topic consumer', () => {
      broker = new QueueBroker(
        [makeWorkerService('multi-worker', ['orders', 'events'])],
        getServiceOrigin
      );

      broker.enqueue('events', Buffer.from('{"kind":"event"}'), 'text/plain', {
        delaySeconds: 1,
      });
      vi.setSystemTime(Date.now() + 2_000);

      const messages = broker.receiveMessages('events', 'multi-worker');
      expect(messages).toHaveLength(1);
      expect(messages[0].payload.toString()).toBe('{"kind":"event"}');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not receive expired retained messages between cleanup ticks', () => {
      broker = new QueueBroker([], getServiceOrigin);
      broker.enqueue('orders', Buffer.from('{}'), 'application/json', {
        retentionSeconds: 1,
      });
      broker.receiveMessages('orders', 'fulfillment');
      vi.setSystemTime(Date.now() + 1_001);

      expect(broker.receiveMessages('orders', 'analytics')).toEqual([]);
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

      const received = broker.receiveById('orders', messageId, 'worker-a')!;
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
      const received = broker.receiveById('orders', messageId, 'worker-a');
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

    it('keeps an acknowledged message available to new consumer groups', async () => {
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

      const handle = broker.receiveById(
        'orders',
        messageId,
        'worker-a'
      )!.receiptHandle;
      broker.acknowledge(messageId, 'worker-a', handle);

      expect(broker.receiveById('orders', messageId, 'worker-a')).toBeNull();
      expect(
        broker.receiveById('orders', messageId, 'new-pull-group')
      ).not.toBeNull();
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
      const handleA = broker.receiveById(
        'order-created',
        messageId,
        'worker-a'
      )!.receiptHandle;
      broker.acknowledge(messageId, 'worker-a', handleA);

      // Still available in group B
      const resultB = broker.receiveById(
        'order-created',
        messageId,
        'worker-b'
      );
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

      const handle = broker.receiveById(
        'orders',
        messageId,
        'worker-a'
      )!.receiptHandle;
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

      const handle = broker.receiveById(
        'orders',
        messageId,
        'worker-a'
      )!.receiptHandle;

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

      // The failed delivery remains hidden until its retry delay passes.
      expect(broker.receiveById('orders', messageId, 'worker-a')).toBeNull();

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

      // Service becomes available and is retried on the next broker tick.
      getServiceOrigin.mockReturnValue('http://localhost:3001');
      await vi.advanceTimersByTimeAsync(1_001);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('lease expiry', () => {
    it('makes expired pull leases immediately available', async () => {
      broker = new QueueBroker([], getServiceOrigin);
      const { messageId } = broker.enqueue(
        'orders',
        Buffer.from('{}'),
        'application/json'
      );

      const [first] = broker.receiveMessages('orders', 'fulfillment', {
        visibilityTimeoutSeconds: 1,
      });
      expect(first.messageId).toBe(messageId);

      await vi.advanceTimersByTimeAsync(1_001);

      const [second] = broker.receiveMessages('orders', 'fulfillment');
      expect(second.messageId).toBe(messageId);
      expect(second.deliveryCount).toBe(2);
    });

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
      const first = broker.receiveById('orders', messageId, 'worker-a');
      expect(first!.deliveryCount).toBe(1);

      // Expire lease + retry delay + tick → re-dispatch
      await vi.advanceTimersByTimeAsync(121_000);

      // Second delivery
      const second = broker.receiveById('orders', messageId, 'worker-a');
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
      expect(
        broker.receiveById('orders', messageId, 'worker-a')
      ).not.toBeNull();

      // Advance past retention
      await vi.advanceTimersByTimeAsync(11_000);

      // Message gone
      expect(broker.receiveById('orders', messageId, 'worker-a')).toBeNull();
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
