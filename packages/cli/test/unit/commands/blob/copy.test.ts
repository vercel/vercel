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
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue({
      token: 'test-token',
      success: true,
    });
    mockedBlob.copy.mockResolvedValue({
      url: 'https://example.com/copied-file.txt',
      downloadUrl: 'https://example.com/copied-file.txt',
      pathname: 'copied-file.txt',
      contentType: 'text/plain',
      contentDisposition: 'attachment; filename="copied-file.txt"',
    });
  });

  describe('successful copy', () => {
    it('should copy blob successfully and track telemetry', async () => {
      client.setArgv('blob', 'copy', 'source.txt', 'dest.txt');

      const exitCode = await copy(client, ['source.txt', 'dest.txt']);

      expect(exitCode).toBe(0);
      expect(mockedGetBlobRWToken).toHaveBeenCalledWith(client);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: 'test-token',
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
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

      const exitCode = await copy(client, [
        '--add-random-suffix',
        '--content-type',
        'image/png',
        '--cache-control-max-age',
        '86400',
        'source.png',
        'dest.png',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.png', 'dest.png', {
        token: 'test-token',
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/png',
        cacheControlMaxAge: 86400,
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

      const exitCode = await copy(client, [sourceUrl, 'dest.txt']);

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith(sourceUrl, 'dest.txt', {
        token: 'test-token',
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
      });
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

      const exitCode = await copy(client, ['--invalid-flag']);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when token is not available', async () => {
      mockedGetBlobRWToken.mockResolvedValue({
        error: 'No token found',
        success: false,
      });

      const exitCode = await copy(client, ['source.txt', 'dest.txt']);

      expect(exitCode).toBe(1);
      expect(mockedBlob.copy).not.toHaveBeenCalled();
    });

    it('should return 1 when blob copy fails', async () => {
      const copyError = new Error('Blob copy failed');
      mockedBlob.copy.mockRejectedValue(copyError);

      const exitCode = await copy(client, ['source.txt', 'dest.txt']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Copying blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await copy(client, []);

      expect(exitCode).toBe(1);
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });
  });

  describe('telemetry tracking', () => {
    it('should not track optional flags when not provided', async () => {
      client.setArgv('blob', 'copy', 'source.txt', 'dest.txt');

      await copy(client, ['source.txt', 'dest.txt']);

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

      await copy(client, [
        '--content-type',
        'application/json',
        'source.json',
        'dest.json',
      ]);

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

      await copy(client, [
        '--cache-control-max-age',
        '3600',
        'source.txt',
        'dest.txt',
      ]);

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

  describe('flag variations', () => {
    it('should handle addRandomSuffix flag correctly when false', async () => {
      const exitCode = await copy(client, ['source.txt', 'dest.txt']);

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: 'test-token',
        access: 'public',
        addRandomSuffix: false,
        contentType: undefined,
        cacheControlMaxAge: undefined,
      });
    });

    it('should handle addRandomSuffix flag correctly when true', async () => {
      const exitCode = await copy(client, [
        '--add-random-suffix',
        'source.txt',
        'dest.txt',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedBlob.copy).toHaveBeenCalledWith('source.txt', 'dest.txt', {
        token: 'test-token',
        access: 'public',
        addRandomSuffix: true,
        contentType: undefined,
        cacheControlMaxAge: undefined,
      });
    });
  });
});
