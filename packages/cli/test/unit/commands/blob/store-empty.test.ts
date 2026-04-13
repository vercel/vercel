import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import emptyStore from '../../../../src/commands/blob/store-empty';
import * as blobModule from '@vercel/blob';
import * as linkModule from '../../../../src/util/projects/link';
import output from '../../../../src/output-manager';
import type { BlobRWToken } from '../../../../src/util/blob/token';

vi.mock('@vercel/blob');
vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/output-manager');

const mockedBlob = vi.mocked(blobModule);
const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedOutput = vi.mocked(output);

describe('blob empty-store', () => {
  const testToken = 'vercel_blob_rw_abc123_additional_data';
  const fullToken: BlobRWToken = { success: true, token: testToken };
  const storeId = 'store_abc123';

  const confirmInputMock = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    client.input.confirm = confirmInputMock;
    (client.stdin as any).isTTY = true;

    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'proj_123',
        name: 'my-project',
        accountId: 'org_123',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      },
      org: { id: 'org_123', slug: 'my-org', type: 'user' },
    });

    // Default: store info, no connections
    client.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        store: { name: 'my-store' },
      })
      .mockResolvedValueOnce({
        connections: [],
      });

    // Default: initial list check returns blobs (not empty),
    // then deletion loop: one page of blobs, then empty
    mockedBlob.list
      .mockResolvedValueOnce({
        blobs: [{ url: 'https://example.com/a.txt' }],
        cursor: '',
        hasMore: false,
      } as any)
      .mockResolvedValueOnce({
        blobs: [
          { url: 'https://example.com/a.txt' },
          { url: 'https://example.com/b.txt' },
        ],
        cursor: '',
        hasMore: false,
      } as any)
      .mockResolvedValueOnce({
        blobs: [],
        cursor: '',
        hasMore: false,
      } as any);

    mockedBlob.del.mockResolvedValue(undefined as any);
  });

  describe('successful empty', () => {
    it('should confirm and empty store (single page)', async () => {
      const exitCode = await emptyStore(client, [], testToken, fullToken);

      expect(exitCode).toBe(0);

      // Should fetch store info and connections with accountId
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: 'org_123' }
      );
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}/connections`,
        { method: 'GET', accountId: 'org_123' }
      );

      // Initial emptiness check via blob.list with limit 1
      expect(mockedBlob.list).toHaveBeenNthCalledWith(1, {
        token: testToken,
        limit: 1,
      });

      // Should show confirmation prompt
      expect(confirmInputMock).toHaveBeenCalledWith(
        `Are you sure you want to delete all files in my-store (${storeId})? This action cannot be undone.`,
        false
      );

      // Deletion loop lists with limit 1000
      expect(mockedBlob.list).toHaveBeenNthCalledWith(2, {
        token: testToken,
        limit: 1000,
      });
      expect(mockedBlob.del).toHaveBeenCalledWith(
        ['https://example.com/a.txt', 'https://example.com/b.txt'],
        { token: testToken }
      );

      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'All blobs deleted (2 total)'
      );
    });

    it('should confirm and empty store (multiple pages with pagination)', async () => {
      mockedBlob.list.mockReset();
      mockedBlob.list
        // Initial emptiness check
        .mockResolvedValueOnce({
          blobs: [{ url: 'https://example.com/1.txt' }],
          cursor: '',
          hasMore: false,
        } as any)
        // Deletion loop page 1
        .mockResolvedValueOnce({
          blobs: [
            { url: 'https://example.com/1.txt' },
            { url: 'https://example.com/2.txt' },
          ],
          cursor: 'cursor1',
          hasMore: true,
        } as any)
        // Deletion loop page 2
        .mockResolvedValueOnce({
          blobs: [{ url: 'https://example.com/3.txt' }],
          cursor: '',
          hasMore: false,
        } as any)
        // Deletion loop: no more blobs
        .mockResolvedValueOnce({
          blobs: [],
          cursor: '',
          hasMore: false,
        } as any);

      const exitCode = await emptyStore(client, [], testToken, fullToken);

      expect(exitCode).toBe(0);
      // 1 initial check + 3 deletion loop calls
      expect(mockedBlob.list).toHaveBeenCalledTimes(4);
      expect(mockedBlob.del).toHaveBeenCalledTimes(2);
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'All blobs deleted (3 total)'
      );
    });

    it('should skip confirmation with --yes', async () => {
      const exitCode = await emptyStore(
        client,
        ['--yes'],
        testToken,
        fullToken
      );

      expect(exitCode).toBe(0);
      expect(confirmInputMock).not.toHaveBeenCalled();
      expect(mockedBlob.del).toHaveBeenCalled();
    });

    it('should show connected projects in confirmation message', async () => {
      client.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          store: { name: 'my-store' },
        })
        .mockResolvedValueOnce({
          connections: [
            { project: { name: 'project1' } },
            { project: { name: 'project2' } },
          ],
        });

      await emptyStore(client, [], testToken, fullToken);

      expect(confirmInputMock).toHaveBeenCalledWith(
        `Are you sure you want to delete all files in my-store (${storeId})? This store is connected to project1, project2. This action cannot be undone.`,
        false
      );
    });

    it('should show remaining project count when more than 2 connections', async () => {
      client.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          store: { name: 'my-store' },
        })
        .mockResolvedValueOnce({
          connections: [
            { project: { name: 'project1' } },
            { project: { name: 'project2' } },
            { project: { name: 'project3' } },
            { project: { name: 'project4' } },
            { project: { name: 'project5' } },
          ],
        });

      await emptyStore(client, [], testToken, fullToken);

      expect(confirmInputMock).toHaveBeenCalledWith(
        `Are you sure you want to delete all files in my-store (${storeId})? This store is connected to project1, project2 and 3 other projects. This action cannot be undone.`,
        false
      );
    });

    it('should work without accountId when project is not linked', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        org: null,
        project: null,
        status: 'not_linked',
      });

      const exitCode = await emptyStore(client, [], testToken, fullToken);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        `/v1/storage/stores/${storeId}`,
        { method: 'GET', accountId: undefined }
      );
    });
  });

  describe('empty store handling', () => {
    it('should handle empty store gracefully', async () => {
      mockedBlob.list.mockReset();
      // Initial emptiness check returns no blobs
      mockedBlob.list.mockResolvedValueOnce({
        blobs: [],
        cursor: '',
        hasMore: false,
      } as any);

      const exitCode = await emptyStore(client, [], testToken, fullToken);

      expect(exitCode).toBe(0);
      expect(confirmInputMock).not.toHaveBeenCalled();
      // Only the initial check, no deletion loop
      expect(mockedBlob.list).toHaveBeenCalledTimes(1);
      expect(mockedBlob.list).toHaveBeenCalledWith({
        token: testToken,
        limit: 1,
      });
      expect(mockedBlob.del).not.toHaveBeenCalled();
      expect(mockedOutput.log).toHaveBeenCalledWith('Store is already empty');
    });
  });

  describe('cancellation', () => {
    it('should cancel when user declines', async () => {
      confirmInputMock.mockResolvedValueOnce(false);

      const exitCode = await emptyStore(client, [], testToken, fullToken);

      expect(exitCode).toBe(0);
      // Initial check happened but no deletion
      expect(mockedBlob.list).toHaveBeenCalledTimes(1);
      expect(mockedBlob.del).not.toHaveBeenCalled();
      expect(mockedOutput.log).toHaveBeenCalledWith('Canceled');
    });
  });

  describe('non-TTY behavior', () => {
    it('should error in non-TTY without --yes', async () => {
      (client.stdin as any).isTTY = false;

      const exitCode = await emptyStore(client, [], testToken, fullToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Missing --yes flag. This is a destructive operation, use --yes to confirm.'
      );
      // Initial check happened but no deletion
      expect(mockedBlob.list).toHaveBeenCalledTimes(1);
      expect(mockedBlob.del).not.toHaveBeenCalled();
    });

    it('should work in non-TTY with --yes', async () => {
      (client.stdin as any).isTTY = false;

      // Reset blob mocks for this test since beforeEach mocks may be consumed
      mockedBlob.list.mockReset();
      mockedBlob.list
        .mockResolvedValueOnce({
          blobs: [{ url: 'https://example.com/a.txt' }],
          cursor: '',
          hasMore: false,
        } as any)
        .mockResolvedValueOnce({
          blobs: [{ url: 'https://example.com/a.txt' }],
          cursor: '',
          hasMore: false,
        } as any)
        .mockResolvedValueOnce({
          blobs: [],
          cursor: '',
          hasMore: false,
        } as any);

      // Also reset fetch mocks
      client.fetch = vi
        .fn()
        .mockResolvedValueOnce({ store: { name: 'my-store' } })
        .mockResolvedValueOnce({ connections: [] });

      const exitCode = await emptyStore(
        client,
        ['--yes'],
        testToken,
        fullToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalled();
    });
  });

  describe('error cases', () => {
    it('should return 1 when argument parsing fails', async () => {
      const exitCode = await emptyStore(
        client,
        ['--invalid-flag'],
        testToken,
        fullToken
      );

      expect(exitCode).toBe(1);
    });

    it('should return 1 when token is not available', async () => {
      const failedToken: BlobRWToken = {
        success: false,
        error: 'No token',
      };

      const exitCode = await emptyStore(client, [], testToken, failedToken);

      expect(exitCode).toBe(1);
    });

    it('should handle API errors during store fetch', async () => {
      client.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const exitCode = await emptyStore(client, [], testToken, fullToken);

      expect(exitCode).toBe(1);
    });

    it('should handle API errors during blob list', async () => {
      mockedBlob.list.mockReset();
      mockedBlob.list.mockRejectedValue(new Error('List failed'));

      const exitCode = await emptyStore(
        client,
        ['--yes'],
        testToken,
        fullToken
      );

      expect(exitCode).toBe(1);
    });

    it('should handle API errors during blob delete', async () => {
      mockedBlob.list.mockReset();
      // Initial check returns blobs
      mockedBlob.list.mockResolvedValueOnce({
        blobs: [{ url: 'https://example.com/a.txt' }],
        cursor: '',
        hasMore: false,
      } as any);
      // Deletion loop returns blobs
      mockedBlob.list.mockResolvedValueOnce({
        blobs: [{ url: 'https://example.com/a.txt' }],
        cursor: '',
        hasMore: false,
      } as any);
      mockedBlob.del.mockRejectedValue(new Error('Delete failed'));

      const exitCode = await emptyStore(
        client,
        ['--yes'],
        testToken,
        fullToken
      );

      expect(exitCode).toBe(1);
    });
  });

  describe('telemetry', () => {
    it('should track --yes flag', async () => {
      await emptyStore(client, ['--yes'], testToken, fullToken);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });
});
