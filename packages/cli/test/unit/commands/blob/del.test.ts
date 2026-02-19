import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import del from '../../../../src/commands/blob/del';
import * as blobModule from '@vercel/blob';
import * as getBlobRWTokenModule from '../../../../src/util/blob/token';
import output from '../../../../src/output-manager';

// Mock the external dependencies
vi.mock('@vercel/blob');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');

const mockedBlob = vi.mocked(blobModule);
const mockedGetBlobRWToken = vi.mocked(getBlobRWTokenModule.getBlobRWToken);
const mockedOutput = vi.mocked(output);

describe('blob del', () => {
  const testToken = 'vercel_blob_rw_test_token_123';

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue({
      token: testToken,
      success: true,
    });
    mockedBlob.del.mockResolvedValue();
  });

  describe('successful deletion', () => {
    it('should delete single blob successfully and track telemetry', async () => {
      client.setArgv('blob', 'del', 'test-file.txt');

      const exitCode = await del(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalledWith(['test-file.txt'], {
        token: testToken,
        ifMatch: undefined,
      });
      expect(mockedOutput.debug).toHaveBeenCalledWith('Deleting blob');
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Deleting blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith('Blob deleted');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlsOrPathnames',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should delete multiple blobs successfully', async () => {
      client.setArgv('blob', 'del', 'file1.txt', 'file2.txt', 'file3.txt');

      const exitCode = await del(
        client,
        ['file1.txt', 'file2.txt', 'file3.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalledWith(
        ['file1.txt', 'file2.txt', 'file3.txt'],
        {
          token: testToken,
          ifMatch: undefined,
        }
      );
      expect(mockedOutput.success).toHaveBeenCalledWith('Blob deleted');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlsOrPathnames',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should handle URL as argument', async () => {
      const blobUrl = 'https://example.com/blob-file.txt';
      client.setArgv('blob', 'del', blobUrl);

      const exitCode = await del(client, [blobUrl], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalledWith([blobUrl], {
        token: testToken,
        ifMatch: undefined,
      });
    });

    it('should handle mixed URLs and pathnames', async () => {
      const args = [
        'https://example.com/file1.txt',
        'local-file.txt',
        'folder/file2.txt',
      ];
      client.setArgv('blob', 'del', ...args);

      const exitCode = await del(client, args, testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalledWith(args, {
        token: testToken,
        ifMatch: undefined,
      });
    });
  });

  describe('--if-match option', () => {
    it('should pass --if-match to blob.del', async () => {
      client.setArgv(
        'blob',
        'del',
        '--if-match',
        '"some-etag"',
        'test-file.txt'
      );

      const exitCode = await del(
        client,
        ['--if-match', '"some-etag"', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalledWith(['test-file.txt'], {
        token: testToken,
        ifMatch: '"some-etag"',
      });
    });

    it('should track --if-match telemetry', async () => {
      const exitCode = await del(
        client,
        ['--if-match', '"etag-value"', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlsOrPathnames',
          value: '[REDACTED]',
        },
        {
          key: 'option:if-match',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('error cases', () => {
    it('should return 1 when argument parsing fails', async () => {
      const parseError = new Error('Invalid argument');
      vi.doMock('../../../../src/util/get-args', () => ({
        parseArguments: vi.fn().mockImplementation(() => {
          throw parseError;
        }),
      }));

      const exitCode = await del(client, ['--invalid-flag'], testToken);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await del(client, [], testToken);

      expect(exitCode).toBe(1);
      expect(mockedBlob.del).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when blob deletion fails', async () => {
      const deleteError = new Error('Blob deletion failed');
      mockedBlob.del.mockRejectedValue(deleteError);

      const exitCode = await del(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Deleting blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Error deleting blob: Error: Blob deletion failed'
      );
    });
  });

  describe('telemetry tracking', () => {
    it('should track first argument for telemetry', async () => {
      const exitCode = await del(
        client,
        ['first-file.txt', 'second-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlsOrPathnames',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should track argument even with single file', async () => {
      const exitCode = await del(client, ['single-file.txt'], testToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlsOrPathnames',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should not track telemetry when no arguments provided', async () => {
      const exitCode = await del(client, [], testToken);

      expect(exitCode).toBe(1);
      // Should not have any telemetry events since arguments are missing
      expect(client.telemetryEventStore).not.toHaveTelemetryEvents([
        {
          key: 'argument:urlsOrPathnames',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('argument validation', () => {
    it('should accept various file path formats', async () => {
      const testCases = [
        ['simple.txt'],
        ['folder/file.txt'],
        ['deep/nested/folder/file.txt'],
        ['file-with-dashes.txt'],
        ['file_with_underscores.txt'],
        ['file.with.dots.txt'],
      ];

      for (const args of testCases) {
        const exitCode = await del(client, args, testToken);
        expect(exitCode).toBe(0);
        expect(mockedBlob.del).toHaveBeenCalledWith(args, {
          token: testToken,
        });
      }
    });

    it('should accept URL formats', async () => {
      const urlCases = [
        ['https://example.com/file.txt'],
        ['https://cdn.example.com/path/to/file.pdf'],
        ['https://storage.googleapis.com/bucket/file.jpg'],
      ];

      for (const args of urlCases) {
        const exitCode = await del(client, args, testToken);
        expect(exitCode).toBe(0);
        expect(mockedBlob.del).toHaveBeenCalledWith(args, {
          token: testToken,
        });
      }
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during deletion and stop it on success', async () => {
      const exitCode = await del(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Deleting blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith('Blob deleted');
    });

    it('should not stop spinner on error', async () => {
      const deleteError = new Error('Network error');
      mockedBlob.del.mockRejectedValue(deleteError);

      const exitCode = await del(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Deleting blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Error deleting blob: Error: Network error'
      );
    });
  });
});
