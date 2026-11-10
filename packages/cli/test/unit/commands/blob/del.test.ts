import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import del from '../../../../src/commands/blob/del';
import blob from '../../../../src/commands/blob';
import * as blobModule from '@vercel/blob';
import * as getBlobRWTokenModule from '../../../../src/util/blob/token';
import type { BlobRWToken } from '../../../../src/util/blob/token';
import output from '../../../../src/output-manager';

// Mock the external dependencies
vi.mock('@vercel/blob');
vi.mock('../../../../src/util/blob/token', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/blob/token')
  >('../../../../src/util/blob/token');
  return { ...actual, getBlobRWToken: vi.fn() };
});
vi.mock('../../../../src/output-manager');

const mockedBlob = vi.mocked(blobModule);
const mockedGetBlobRWToken = vi.mocked(getBlobRWTokenModule.getBlobRWToken);
const mockedOutput = vi.mocked(output);

describe('blob del', () => {
  const testToken = 'vercel_blob_rw_test_token_123';
  const testAuth: BlobRWToken = {
    success: true,
    kind: 'rw',
    token: testToken,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    // Most tests run without a terminal, where a delete still goes ahead.
    client.stdin.isTTY = false;

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue({
      success: true,
      kind: 'rw',
      token: testToken,
    });
    mockedBlob.del.mockResolvedValue();
  });

  describe('successful deletion', () => {
    it('should delete single blob successfully and track telemetry', async () => {
      client.setArgv('blob', 'del', 'test-file.txt');

      const exitCode = await del(client, ['test-file.txt'], testAuth);

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
        testAuth
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

      const exitCode = await del(client, [blobUrl], testAuth);

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

      const exitCode = await del(client, args, testAuth);

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
        testAuth
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
        testAuth
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

      const exitCode = await del(client, ['--invalid-flag'], testAuth);
      expect(exitCode).toBe(2);
    });

    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await del(client, [], testAuth);

      expect(exitCode).toBe(2);
      expect(mockedBlob.del).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when blob deletion fails', async () => {
      const deleteError = new Error('Blob deletion failed');
      mockedBlob.del.mockRejectedValue(deleteError);

      const exitCode = await del(client, ['test-file.txt'], testAuth);

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
        testAuth
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
      const exitCode = await del(client, ['single-file.txt'], testAuth);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlsOrPathnames',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should not track telemetry when no arguments provided', async () => {
      const exitCode = await del(client, [], testAuth);

      expect(exitCode).toBe(2);
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
        const exitCode = await del(client, args, testAuth);
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
        const exitCode = await del(client, args, testAuth);
        expect(exitCode).toBe(0);
        expect(mockedBlob.del).toHaveBeenCalledWith(args, {
          token: testToken,
        });
      }
    });
  });

  describe('subcommand name', () => {
    it.each([
      'delete',
      'del',
      'rm',
    ])('deletes as %s without a warning', async name => {
      client.setArgv('blob', name, 'test-file.txt', '--yes');

      expect(await blob(client)).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalledWith(['test-file.txt'], {
        token: testToken,
        ifMatch: undefined,
      });
      expect(mockedOutput.warning).not.toHaveBeenCalled();
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:delete', value: name },
        { key: 'argument:urlsOrPathnames', value: '[REDACTED]' },
        { key: 'flag:yes', value: 'TRUE' },
      ]);
    });

    it('warns that remove is deprecated', async () => {
      client.setArgv('blob', 'remove', 'test-file.txt', '--yes');

      expect(await blob(client)).toBe(0);
      expect(mockedBlob.del).toHaveBeenCalled();
      expect(mockedOutput.warning).toHaveBeenCalledWith(
        '`vercel blob remove` is deprecated. Use `vercel blob delete`.'
      );
    });
  });

  describe('confirmation', () => {
    const noTerminalWarning =
      'Deleting blobs without a terminal will need --yes in a future major version. Add --yes to keep this working.';

    beforeEach(() => {
      client.stdin.isTTY = true;
    });

    it('asks before deleting one blob', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      expect(await del(client, ['test-file.txt'], testAuth)).toBe(0);
      expect(client.input.confirm).toHaveBeenCalledWith(
        'Delete test-file.txt? This cannot be undone.',
        false
      );
      expect(mockedBlob.del).toHaveBeenCalled();
    });

    it('lists the blobs before deleting several', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);
      const files = Array.from({ length: 7 }, (_, i) => `file${i}.txt`);

      expect(await del(client, files, testAuth)).toBe(0);
      expect(mockedOutput.print).toHaveBeenCalledWith('  file0.txt\n');
      expect(mockedOutput.print).toHaveBeenCalledWith('  file4.txt\n');
      expect(mockedOutput.print).not.toHaveBeenCalledWith('  file5.txt\n');
      expect(mockedOutput.print).toHaveBeenCalledWith('  and 2 more\n');
      expect(client.input.confirm).toHaveBeenCalledWith(
        'Delete 7 blobs? This cannot be undone.',
        false
      );
    });

    it('deletes nothing when the prompt is declined', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(false);

      expect(await del(client, ['test-file.txt'], testAuth)).toBe(130);
      expect(mockedOutput.log).toHaveBeenCalledWith(
        'Canceled. Nothing was changed.'
      );
      expect(mockedBlob.del).not.toHaveBeenCalled();
    });

    it('skips the prompt with --yes', async () => {
      client.input.confirm = vi.fn();

      expect(await del(client, ['test-file.txt', '--yes'], testAuth)).toBe(0);
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(mockedOutput.warning).not.toHaveBeenCalled();
      expect(mockedBlob.del).toHaveBeenCalled();
    });

    it('still deletes without a terminal, with a warning', async () => {
      client.stdin.isTTY = false;
      client.input.confirm = vi.fn();

      expect(await del(client, ['test-file.txt'], testAuth)).toBe(0);
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(mockedOutput.warning).toHaveBeenCalledWith(noTerminalWarning);
      expect(mockedBlob.del).toHaveBeenCalled();
    });
  });
});
