import { describe, expect, it, vi, beforeEach } from 'vitest';
import sleep from 'sleep-promise';
import type {
  Deployment,
  DeploymentAliasAssignedEvent,
  VercelClientOptions,
} from '../src/types';
import { checkDeploymentStatus } from '../src/check-deployment-status';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual('../src/utils');
  return {
    ...actual,
    fetchApi: mockFetch,
  };
});

vi.mock('sleep-promise', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

function mockDeployment(): Deployment {
  return {
    id: 'dpl_123',
    name: 'test-deployment',
    url: 'test.vercel.app',
    readyState: 'QUEUED',
    alias: ['test.vercel.app'],
    aliasAssigned: false,
    target: 'production',
  } as Deployment;
}

function mockAliasAssignedEvent(
  overrides: Partial<DeploymentAliasAssignedEvent> = {}
): DeploymentAliasAssignedEvent {
  return {
    type: 'alias-assigned',
    deploymentId: 'dpl_123',
    date: 1783370781619,
    alias: ['final.vercel.app'],
    aliasError: null,
    aliasWarning: null,
    ...overrides,
  };
}

function mockClientOptions(): VercelClientOptions {
  return {
    token: 'test-token',
    path: '/test/path',
  };
}

function mockResponse(
  status: number,
  body: any = {},
  headers: Record<string, string> = {}
) {
  return {
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('checkDeploymentStatus()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
  });

  describe('retry logic', () => {
    it('should retry on HTTP 429 or 503 with Retry-After header', async () => {
      const mockDateString = 'Tue, 29 Oct 2024 16:56:32 GMT';
      vi.setSystemTime(Date.parse(mockDateString) - 7_000);

      mockFetch
        .mockResolvedValueOnce(mockResponse(429, {}, { 'retry-after': '6' }))
        .mockResolvedValueOnce(
          mockResponse(503, {}, { 'retry-after': mockDateString })
        )
        .mockResolvedValueOnce(
          mockResponse(200, {
            ...mockDeployment(),
            readyState: 'READY',
          })
        );

      const iterator = checkDeploymentStatus(
        mockDeployment(),
        mockClientOptions()
      );
      const result = await iterator.next();

      expect(result.value).toEqual({
        type: 'ready',
        payload: expect.objectContaining({ readyState: 'READY' }),
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // 6_000 + 3_000 skew (RETRY_DELAY_SKEW_MS * 0.1)
      expect(sleep).toHaveBeenCalledWith(9_000);
      // 7_000 + 3_000 skew
      expect(sleep).toHaveBeenCalledWith(10_000);
    });

    it('should retry up to 5 times on consecutive failures', async () => {
      mockFetch.mockResolvedValue(mockResponse(500, { error: 'mock error' }));

      const iterator = checkDeploymentStatus(
        mockDeployment(),
        mockClientOptions()
      );
      const result = await iterator.next();

      expect(result.value).toEqual({
        type: 'error',
        payload: 'mock error',
      });
      // 5_000 + 3_000 skew (RETRY_DELAY_SKEW_MS * 0.1)
      expect(sleep).toHaveBeenCalledWith(8_000);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('alias-assigned stream signal', () => {
    it('finishes from an existing signal without fetching the deployment', async () => {
      const date = 1783370781619;
      const controller = new AbortController();
      controller.abort(
        mockAliasAssignedEvent({
          date,
          aliasWarning: {
            code: 'alias_warning',
            message: 'Alias warning',
          },
        })
      );

      const deployment = {
        ...mockDeployment(),
        alias: ['initial.vercel.app'],
        aliasError: {
          code: 'old_alias_error',
          message: 'Old alias error',
        },
        aliasWarning: null,
      };

      const iterator = checkDeploymentStatus(deployment, {
        ...mockClientOptions(),
        aliasAssignedSignal: controller.signal,
      });

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          type: 'ready',
          payload: expect.objectContaining({
            readyState: 'READY',
            aliasAssigned: date,
            alias: ['final.vercel.app'],
            aliasError: null,
            aliasWarning: {
              code: 'alias_warning',
              message: 'Alias warning',
            },
            target: 'production',
            url: 'test.vercel.app',
          }),
        },
      });
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          type: 'alias-assigned',
          payload: expect.objectContaining({
            readyState: 'READY',
            aliasAssigned: date,
          }),
        },
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('keeps the latest polling response and cancels the polling timer', async () => {
      const date = 1783370781619;
      const controller = new AbortController();
      const latestDeployment = {
        ...mockDeployment(),
        readyState: 'BUILDING',
        url: 'latest.vercel.app',
        alias: ['latest.example.com'],
      };
      mockFetch.mockResolvedValueOnce(mockResponse(200, latestDeployment));

      const iterator = checkDeploymentStatus(mockDeployment(), {
        ...mockClientOptions(),
        aliasAssignedSignal: controller.signal,
      });
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'building', payload: latestDeployment },
      });

      const nextEvent = iterator.next();
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(1);
      controller.abort(
        mockAliasAssignedEvent({
          date,
          alias: ['final.example.com'],
        })
      );

      await expect(nextEvent).resolves.toEqual({
        done: false,
        value: {
          type: 'ready',
          payload: expect.objectContaining({
            readyState: 'READY',
            aliasAssigned: date,
            url: 'latest.vercel.app',
            alias: ['final.example.com'],
          }),
        },
      });
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          type: 'alias-assigned',
          payload: expect.objectContaining({ aliasAssigned: date }),
        },
      });
      expect(vi.getTimerCount()).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('aborts an in-flight status request when the signal wins', async () => {
      const controller = new AbortController();
      let statusSignal: AbortSignal | undefined;
      mockFetch.mockImplementation((_url, _token, options) => {
        statusSignal = options.signal;
        return new Promise((_resolve, reject) => {
          statusSignal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      });

      const iterator = checkDeploymentStatus(mockDeployment(), {
        ...mockClientOptions(),
        aliasAssignedSignal: controller.signal,
      });
      const nextEvent = iterator.next();
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

      controller.abort(mockAliasAssignedEvent());

      await expect(nextEvent).resolves.toEqual({
        done: false,
        value: {
          type: 'ready',
          payload: expect.objectContaining({ readyState: 'READY' }),
        },
      });
      expect(statusSignal?.aborted).toBe(true);
    });

    it('continues polling for an incomplete stream event', async () => {
      const controller = new AbortController();
      controller.abort({
        type: 'alias-assigned',
        deploymentId: 'dpl_123',
        date: 1783370781619,
      });
      const deployment = {
        ...mockDeployment(),
        readyState: 'READY',
        aliasAssigned: 1783370781619,
      };
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(mockResponse(200, deployment));

      const iterator = checkDeploymentStatus(mockDeployment(), {
        ...mockClientOptions(),
        aliasAssignedSignal: controller.signal,
      });

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'ready', payload: deployment },
      });
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'alias-assigned', payload: deployment },
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('continues polling when no stream signal arrives', async () => {
      const controller = new AbortController();
      const deployment = {
        ...mockDeployment(),
        readyState: 'READY',
        aliasAssigned: 1783370781619,
      };
      mockFetch.mockResolvedValueOnce(mockResponse(200, deployment));

      const iterator = checkDeploymentStatus(mockDeployment(), {
        ...mockClientOptions(),
        aliasAssignedSignal: controller.signal,
      });

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'ready', payload: deployment },
      });
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { type: 'alias-assigned', payload: deployment },
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(controller.signal.aborted).toBe(false);
    });

    it('continues to return alias errors from polling', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, {
          ...mockDeployment(),
          aliasError: { code: 'alias_error', message: 'Alias failed' },
        })
      );

      const iterator = checkDeploymentStatus(mockDeployment(), {
        ...mockClientOptions(),
        aliasAssignedSignal: controller.signal,
      });

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          type: 'error',
          payload: { code: 'alias_error', message: 'Alias failed' },
        },
      });
    });
  });
});
