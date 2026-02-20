import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Deployment } from '../src/types';

const { mockFetch, mockBuildFileTree } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockBuildFileTree: vi.fn(),
}));

const { mockHashes } = vi.hoisted(() => ({
  mockHashes: vi.fn(),
}));

const { mockLstatSync, mockPathExists } = vi.hoisted(() => ({
  mockLstatSync: vi.fn(),
  mockPathExists: vi.fn(),
}));

vi.mock('../src/utils', async () => {
  const actual = await vi.importActual('../src/utils');
  return {
    ...actual,
    fetch: mockFetch,
    buildFileTree: mockBuildFileTree,
  };
});

vi.mock('../src/utils/hashes', async () => {
  const actual = await vi.importActual('../src/utils/hashes');
  return {
    ...actual,
    hashes: mockHashes,
  };
});

vi.mock('fs-extra', async () => {
  const actual = await vi.importActual('fs-extra');
  return {
    ...actual,
    default: {
      ...actual,
      lstatSync: mockLstatSync,
      pathExists: mockPathExists,
    },
    lstatSync: mockLstatSync,
    pathExists: mockPathExists,
  };
});

function mockDeploymentResponse(): Deployment {
  return {
    id: 'dpl_123',
    name: 'test-deployment',
    url: 'test.vercel.app',
    readyState: 'INITIALIZING',
  } as Deployment;
}

function mockResponse(status: number, body: any = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => null,
      entries: () => [][Symbol.iterator](),
    },
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('manual deployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for lstatSync - returns directory
    mockLstatSync.mockReturnValue({
      isDirectory: () => true,
      isFile: () => false,
      mode: 0o755,
    });
  });

  describe('createDeployment with manual option', () => {
    it('should throw error when manual is true but prebuilt is false', async () => {
      const { default: buildCreateDeployment } = await import(
        '../src/create-deployment'
      );
      const createDeployment = buildCreateDeployment();

      const iterator = createDeployment(
        {
          token: 'test-token',
          path: '/test/path',
          manual: true,
          prebuilt: false,
        },
        {}
      );

      await expect(iterator.next()).rejects.toThrow(
        'The `manual` option requires `prebuilt` to be true'
      );
    });

    it('should set VERCEL_MANUAL_PROVISIONING env var and call deploy with empty files', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, {
          ...mockDeploymentResponse(),
          readyState: 'INITIALIZING',
        })
      );

      const { default: buildCreateDeployment } = await import(
        '../src/create-deployment'
      );
      const createDeployment = buildCreateDeployment();

      const iterator = createDeployment(
        {
          token: 'test-token',
          path: '/test/path',
          manual: true,
          prebuilt: true,
        },
        { name: 'test-deployment' }
      );

      const result = await iterator.next();

      expect(result.value).toEqual({
        type: 'created',
        payload: expect.objectContaining({
          id: 'dpl_123',
          readyState: 'INITIALIZING',
        }),
      });

      // Verify the deployment request included the env var
      expect(mockFetch).toHaveBeenCalledWith(
        '/v13/deployments?prebuilt=1',
        'test-token',
        expect.objectContaining({
          body: expect.stringContaining('VERCEL_MANUAL_PROVISIONING'),
        })
      );
    });

    it('should not wait for ready state in manual mode', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, {
          ...mockDeploymentResponse(),
          readyState: 'INITIALIZING',
        })
      );

      const { default: buildCreateDeployment } = await import(
        '../src/create-deployment'
      );
      const createDeployment = buildCreateDeployment();

      const iterator = createDeployment(
        {
          token: 'test-token',
          path: '/test/path',
          manual: true,
          prebuilt: true,
        },
        { name: 'test-deployment' }
      );

      const events: any[] = [];
      for await (const event of iterator) {
        events.push(event);
      }

      // Should only have 'created' event, no 'ready' or 'alias-assigned'
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('created');
    });
  });

  describe('continueDeployment', () => {
    it('should error when output directory does not exist', async () => {
      mockPathExists.mockResolvedValueOnce(false);

      const { continueDeployment } = await import('../src/continue');

      const iterator = continueDeployment({
        deploymentId: 'dpl_123',
        path: '/test/path',
        token: 'test-token',
      });

      const result = await iterator.next();

      expect(result.value).toEqual({
        type: 'error',
        payload: expect.objectContaining({
          code: 'output_dir_not_found',
        }),
      });
    });

    it('should hash files and call continue endpoint', async () => {
      mockPathExists.mockResolvedValueOnce(true);
      mockBuildFileTree.mockResolvedValueOnce({
        fileList: ['/test/path/.vercel/output/index.html'],
      });

      const mockFilesMap = new Map([
        [
          'abc123',
          {
            names: ['index.html'],
            data: Buffer.from('test'),
            mode: 0o644,
          },
        ],
      ]);
      mockHashes.mockResolvedValueOnce(mockFilesMap);

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, {
          ...mockDeploymentResponse(),
          readyState: 'READY',
          aliasAssigned: true,
        })
      );

      const { continueDeployment } = await import('../src/continue');

      const iterator = continueDeployment({
        deploymentId: 'dpl_123',
        path: '/test/path',
        token: 'test-token',
      });

      const events: any[] = [];
      for await (const event of iterator) {
        events.push(event);
      }

      expect(events.map(e => e.type)).toContain('hashes-calculated');
      expect(mockFetch).toHaveBeenCalledWith(
        '/deployments/dpl_123/continue',
        'test-token',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle missing_files response from continue endpoint', async () => {
      mockPathExists.mockResolvedValueOnce(true);
      mockBuildFileTree.mockResolvedValueOnce({
        fileList: ['/test/path/.vercel/output/index.html'],
      });

      const mockFilesMap = new Map([
        [
          'abc123',
          {
            names: ['index.html'],
            data: Buffer.from('test'),
            mode: 0o644,
          },
        ],
      ]);
      mockHashes.mockResolvedValueOnce(mockFilesMap);

      // First call returns missing_files error
      mockFetch.mockResolvedValueOnce(
        mockResponse(400, {
          error: {
            code: 'missing_files',
            missing: ['abc123'],
          },
        })
      );

      const { continueDeployment } = await import('../src/continue');

      const iterator = continueDeployment({
        deploymentId: 'dpl_123',
        path: '/test/path',
        token: 'test-token',
      });

      const events: any[] = [];
      for await (const event of iterator) {
        events.push(event);
        // Stop after file-count to avoid needing to mock upload
        if (event.type === 'file-count') break;
      }

      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('hashes-calculated');
      expect(eventTypes).toContain('file-count');
    });
  });
});
