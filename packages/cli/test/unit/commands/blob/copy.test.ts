import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import copy from '../../../../src/commands/blob/copy';
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

describe('blob copy', () => {
  const testToken = 'vercel_blob_rw_test_token_123';

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue({
      token: testToken,
      success: true,
    });
    mockedBlob.copy.mockResolvedValue({
      url: 'https://example.com/copied-file.txt',
      downloadUrl: 'https://example.com/copied-file.txt',
      pathname: 'copied-file.txt',
      contentType: 'text/plain',
      contentDisposition: 'attachment; filename="copied-file.txt"',
      etag: 'test-etag',
    });
  });

  describe('successful copy', () => {
    it('should copy blob successfully and track telemetry', async () => {
      client.setArgv('blob', 'copy', 'source.txt', 'dest.txt');

      const exitCode = await copy(
        client,
        ['source.txt', 'dest.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: testToken,
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
        ifMatch: undefined,
      });
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Copying blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'https://example.com/copied-file.txt'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:fromUrlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'argument:toPathname',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should copy blob with all flags and track telemetry', async () => {
      client.setArgv(
        'blob',
        'copy',
        '--add-random-suffix',
        '--content-type',
        'image/png',
        '--cache-control-max-age',
        '86400',
        'source.png',
        'dest.png'
      );

      const exitCode = await copy(
        client,
        [
          '--add-random-suffix',
          '--content-type',
          'image/png',
          '--cache-control-max-age',
          '86400',
          'source.png',
          'dest.png',
        ],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.png', 'dest.png', {
        token: testToken,
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/png',
        cacheControlMaxAge: 86400,
        ifMatch: undefined,
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:fromUrlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'argument:toPathname',
          value: '[REDACTED]',
        },
        {
          key: 'flag:add-random-suffix',
          value: 'TRUE',
        },
        {
          key: 'option:content-type',
          value: 'image/png',
        },
        {
          key: 'option:cache-control-max-age',
          value: '86400',
        },
      ]);
    });

    it('should handle URL as source', async () => {
      const sourceUrl = 'https://example.com/source.txt';
      client.setArgv('blob', 'copy', sourceUrl, 'dest.txt');

      const exitCode = await copy(client, [sourceUrl, 'dest.txt'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith(sourceUrl, 'dest.txt', {
        token: testToken,
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
        ifMatch: undefined,
      });
    });

    it('should use provided token directly', async () => {
      const customToken = 'vercel_blob_rw_custom_456';
      client.setArgv('blob', 'copy', 'source.txt', 'dest.txt');

      const exitCode = await copy(
        client,
        ['source.txt', 'dest.txt'],
        customToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: customToken,
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
      });
    });
  });

  describe('--if-match option', () => {
    it('should pass --if-match to blob.copy', async () => {
      client.setArgv(
        'blob',
        'copy',
        '--if-match',
        '"some-etag"',
        'source.txt',
        'dest.txt'
      );

      const exitCode = await copy(
        client,
        ['--if-match', '"some-etag"', 'source.txt', 'dest.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: testToken,
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
        ifMatch: '"some-etag"',
      });
    });

    it('should track --if-match telemetry', async () => {
      const exitCode = await copy(
        client,
        ['--if-match', '"etag-value"', 'source.txt', 'dest.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:fromUrlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'argument:toPathname',
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

      const exitCode = await copy(client, ['--invalid-flag'], testToken);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when blob copy fails', async () => {
      const copyError = new Error('Blob copy failed');
      mockedBlob.copy.mockRejectedValue(copyError);

      const exitCode = await copy(
        client,
        ['source.txt', 'dest.txt'],
        testToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Copying blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await copy(client, [], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when only one argument is provided', async () => {
      const exitCode = await copy(client, ['source.txt'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });
  });

  describe('telemetry tracking', () => {
    it('should not track optional flags when not provided', async () => {
      client.setArgv('blob', 'copy', 'source.txt', 'dest.txt');

      await copy(client, ['source.txt', 'dest.txt'], testToken);

      // Should only have argument events, no flag or option events
      expect(client.telemetryEventStore).not.toHaveTelemetryEvents([
        {
          key: 'flag:add-random-suffix',
          value: 'TRUE',
        },
      ]);
      expect(client.telemetryEventStore).not.toHaveTelemetryEvents([
        {
          key: 'option:content-type',
          value: expect.any(String),
        },
      ]);
    });

    it('should track content-type option correctly', async () => {
      client.setArgv(
        'blob',
        'copy',
        '--content-type',
        'application/json',
        'source.json',
        'dest.json'
      );

      await copy(
        client,
        ['--content-type', 'application/json', 'source.json', 'dest.json'],
        testToken
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:fromUrlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'argument:toPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:content-type',
          value: 'application/json',
        },
      ]);
    });

    it('should track cache-control-max-age option correctly', async () => {
      client.setArgv(
        'blob',
        'copy',
        '--cache-control-max-age',
        '3600',
        'source.txt',
        'dest.txt'
      );

      await copy(
        client,
        ['--cache-control-max-age', '3600', 'source.txt', 'dest.txt'],
        testToken
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:fromUrlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'argument:toPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:cache-control-max-age',
          value: '3600',
        },
      ]);
    });
  });

  describe('access option', () => {
    it('should handle --access private option', async () => {
      client.setArgv(
        'blob',
        'copy',
        '--access',
        'private',
        'source.txt',
        'dest.txt'
      );

      const exitCode = await copy(
        client,
        ['--access', 'private', 'source.txt', 'dest.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: testToken,
        access: 'private',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
        ifMatch: undefined,
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:fromUrlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'argument:toPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'private',
        },
      ]);
    });
  });

  describe('flag variations', () => {
    it('should handle addRandomSuffix flag correctly when false', async () => {
      const exitCode = await copy(
        client,
        ['source.txt', 'dest.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: testToken,
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
        ifMatch: undefined,
      });
    });

    it('should handle addRandomSuffix flag correctly when true', async () => {
      const exitCode = await copy(
        client,
        ['--add-random-suffix', 'source.txt', 'dest.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: testToken,
        access: 'public',
        addRandomSuffix: true,
        contentType: undefined,
        cacheControlMaxAge: undefined,
        ifMatch: undefined,
      });
    });
  });

  describe('token handling', () => {
    it('should work with different token formats', async () => {
      const tokenFormats = [
        'vercel_blob_rw_abc_def123',
        'vercel_blob_rw_xyz_789ghi',
        'vercel_blob_rw_test_token_456',
      ];

      for (const token of tokenFormats) {
        const exitCode = await copy(client, ['source.txt', 'dest.txt'], token);

        expect(exitCode).toBe(0);
        expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
          token,
          access: 'public',
          addRandomSuffix: false,
          contentType: undefined,
          cacheControlMaxAge: undefined,
        });
      }
    });

    it('should handle empty token', async () => {
      const exitCode = await copy(client, ['source.txt', 'dest.txt'], '');

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: '',
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
      });
    });
  });

  describe('complex scenarios', () => {
    it('should handle copying files with special characters in names', async () => {
      const specialFiles = [
        'file with spaces.txt',
        'file-with-hyphens.txt',
        'file_with_underscores.txt',
        'file.with.dots.txt',
        'file@with@symbols.txt',
      ];

      for (const filename of specialFiles) {
        const exitCode = await copy(client, [filename, 'dest.txt'], testToken);
        expect(exitCode).toBe(0);
        expect(mockedBlob.copy).toHaveBeenCalledWith(
          filename,
          'dest.txt',
          expect.any(Object)
        );
      }
    });

    it('should handle copying to different destination formats', async () => {
      const destinations = [
        'simple-dest.txt',
        'folder/nested/dest.txt',
        'dest-with-timestamp-2023.txt',
        'dest.backup.txt',
      ];

      for (const dest of destinations) {
        const exitCode = await copy(client, ['source.txt', dest], testToken);
        expect(exitCode).toBe(0);
        expect(mockedBlob.copy).toHaveBeenCalledWith(
          'source.txt',
          dest,
          expect.any(Object)
        );
      }
    });

    it('should handle copying with multiple options simultaneously', async () => {
      const exitCode = await copy(
        client,
        [
          '--add-random-suffix',
          '--content-type',
          'application/pdf',
          '--cache-control-max-age',
          '7200',
          'document.pdf',
          'backup/document-copy.pdf',
        ],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith(
        'document.pdf',
        'backup/document-copy.pdf',
        {
          token: testToken,
          access: 'public',
          addRandomSuffix: true,
          contentType: 'application/pdf',
          cacheControlMaxAge: 7200,
          ifMatch: undefined,
        }
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:fromUrlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'argument:toPathname',
          value: '[REDACTED]',
        },
        {
          key: 'flag:add-random-suffix',
          value: 'TRUE',
        },
        {
          key: 'option:content-type',
          value: 'application/pdf',
        },
        {
          key: 'option:cache-control-max-age',
          value: '7200',
        },
      ]);
    });
  });
});
