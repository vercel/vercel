import { describe, expect, it, vi, beforeEach } from 'vitest';
import sleep from 'sleep-promise';
import type { Deployment, VercelClientOptions } from '../src/types';
import { checkDeploymentStatus } from '../src/check-deployment-status';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual('../src/utils');
  return {
    ...actual,
    fetch: mockFetch,
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
  } as Deployment;
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
      expect(sleep).toHaveBeenCalledWith(6_000);
      expect(sleep).toHaveBeenCalledWith(7_000);
    });

    it('should retry up to 3 times on consecutive failures', async () => {
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
      expect(sleep).toHaveBeenCalledWith(5_000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
