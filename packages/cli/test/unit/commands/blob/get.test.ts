import type {
  ReadableStream as WebReadableStream,
  ReadableStreamDefaultController,
} from 'stream/web';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import get from '../../../../src/commands/blob/get';
import * as blobModule from '@vercel/blob';
import * as getBlobRWTokenModule from '../../../../src/util/blob/token';
import output from '../../../../src/output-manager';
import * as fs from 'node:fs';
import * as streamPromises from 'node:stream/promises';
import { PassThrough } from 'node:stream';

// Mock the external dependencies
vi.mock('@vercel/blob');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');
vi.mock('node:fs');
vi.mock('node:stream/promises');

const mockedBlob = vi.mocked(blobModule);
const mockedGetBlobRWToken = vi.mocked(getBlobRWTokenModule.getBlobRWToken);
const mockedOutput = vi.mocked(output);
const mockedCreateWriteStream = vi.mocked(fs.createWriteStream);
const mockedPipeline = vi.mocked(streamPromises.pipeline);

// Helper to create a mock ReadableStream
function createMockReadableStream(
  content: string
): WebReadableStream<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ReadableStream } = require('stream/web');
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  return new ReadableStream({
    start(controller: ReadableStreamDefaultController) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

describe('blob get', () => {
  const testToken = 'vercel_blob_rw_test_token_123';

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue({
      token: testToken,
      success: true,
    });
    mockedBlob.get.mockResolvedValue({
      stream: createMockReadableStream('test content'),
      blob: {
        url: 'https://example.com/test-file.txt',
        pathname: 'test-file.txt',
        contentType: 'text/plain',
        size: 12,
      },
    });
    // Mock createWriteStream to return a PassThrough stream
    mockedCreateWriteStream.mockReturnValue(new PassThrough() as never);
    // Mock pipeline to resolve successfully
    mockedPipeline.mockResolvedValue(undefined);
  });

  describe('successful get', () => {
    it('should get blob successfully with public access and display info', async () => {
      client.setArgv(
        'blob',
        'get',
        '--access',
        'public',
        'https://example.com/test-file.txt'
      );

      const exitCode = await get(
        client,
        ['--access', 'public', 'https://example.com/test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.get).toHaveBeenCalledWith(
        'https://example.com/test-file.txt',
        {
          token: testToken,
          access: 'public',
        }
      );
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('URL: https://example.com/test-file.txt')
      );
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('Pathname: test-file.txt')
      );
      expect(mockedOutput.print).toHaveBeenCalledWith(
        expect.stringContaining('Content-Type: text/plain')
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should get blob with private access', async () => {
      const exitCode = await get(
        client,
        ['--access', 'private', 'my-private-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.get).toHaveBeenCalledWith('my-private-file.txt', {
        token: testToken,
        access: 'private',
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'private',
        },
      ]);
    });

    it('should save blob to output file when --output is provided', async () => {
      const exitCode = await get(
        client,
        ['--access', 'public', '--output', './downloaded.txt', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedCreateWriteStream).toHaveBeenCalledWith('./downloaded.txt');
      expect(mockedPipeline).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        expect.stringContaining('Blob saved to ./downloaded.txt')
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
        {
          key: 'option:output',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('error cases', () => {
    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await get(client, ['--access', 'public'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedBlob.get).not.toHaveBeenCalled();
    });

    it('should return 1 when --access is not provided', async () => {
      const exitCode = await get(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "Missing access level. Must specify --access with either 'private' or 'public'"
      );
      expect(mockedBlob.get).not.toHaveBeenCalled();
    });

    it('should return 1 when --access has invalid value', async () => {
      const exitCode = await get(
        client,
        ['--access', 'invalid', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "Invalid access level: invalid. Must be either 'private' or 'public'"
      );
      expect(mockedBlob.get).not.toHaveBeenCalled();
    });

    it('should return 1 when blob is not found', async () => {
      mockedBlob.get.mockResolvedValue(null);

      const exitCode = await get(
        client,
        ['--access', 'public', 'nonexistent-file.txt'],
        testToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Blob not found: nonexistent-file.txt'
      );
    });

    it('should return 1 when blob get fails', async () => {
      const getError = new Error('Blob get failed');
      mockedBlob.get.mockRejectedValue(getError);

      const exitCode = await get(
        client,
        ['--access', 'public', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
    });

    it('should return 1 when writing to output file fails', async () => {
      mockedPipeline.mockRejectedValue(new Error('Write failed'));

      const exitCode = await get(
        client,
        ['--access', 'public', '--output', './output.txt', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Error writing to file')
      );
    });
  });

  describe('telemetry tracking', () => {
    it('should track urlOrPathname argument', async () => {
      const exitCode = await get(
        client,
        ['--access', 'public', 'tracked-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'public',
        },
      ]);
    });

    it('should track output option when provided', async () => {
      const exitCode = await get(
        client,
        ['--access', 'private', '--output', './out.txt', 'file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'private',
        },
        {
          key: 'option:output',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during get and stop on success', async () => {
      const exitCode = await get(
        client,
        ['--access', 'public', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
    });

    it('should not stop spinner on get error', async () => {
      const getError = new Error('Network error');
      mockedBlob.get.mockRejectedValue(getError);

      const exitCode = await get(
        client,
        ['--access', 'public', 'test-file.txt'],
        testToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Getting blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
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
        const exitCode = await get(
          client,
          ['--access', 'public', 'test-file.txt'],
          token
        );

        expect(exitCode).toBe(0);
        expect(mockedBlob.get).toHaveBeenCalledWith('test-file.txt', {
          token,
          access: 'public',
        });
      }
    });
  });
});
