import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import get from '../../../../src/commands/blob/get';
import * as blobModule from '@vercel/blob';
import output from '../../../../src/output-manager';
import { Readable } from 'node:stream';
import * as fs from 'node:fs';
import * as streamPromises from 'node:stream/promises';

// Mock the external dependencies
vi.mock('@vercel/blob');
vi.mock('../../../../src/output-manager');
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    createWriteStream: vi.fn(),
  };
});
vi.mock('node:stream/promises', async () => {
  const actual = await vi.importActual('node:stream/promises');
  return {
    ...actual,
    pipeline: vi.fn().mockResolvedValue(undefined),
  };
});

const mockedBlob = vi.mocked(blobModule);
const mockedOutput = vi.mocked(output);
const mockedCreateWriteStream = vi.mocked(fs.createWriteStream);
const mockedPipeline = vi.mocked(streamPromises.pipeline);

function createMockGetResult(body?: string) {
  const content = body ?? 'file content here';
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });

  return {
    url: 'https://example.com/test-file.txt',
    downloadUrl: 'https://example.com/test-file.txt',
    pathname: 'test-file.txt',
    contentType: 'text/plain',
    contentDisposition: 'attachment; filename="test-file.txt"',
    contentLength: content.length,
    body: readable,
  };
}

describe('blob get', () => {
  const testToken = 'vercel_blob_rw_test_token_123';

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    mockedBlob.get.mockResolvedValue(createMockGetResult());
    mockedPipeline.mockResolvedValue(undefined);
  });

  describe('successful download', () => {
    it('should stream blob content to stdout by default', async () => {
      client.setArgv('blob', 'get', 'test-file.txt');

      const exitCode = await get(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.get).toHaveBeenCalledWith('test-file.txt', {
        token: testToken,
        access: 'public',
      });
      expect(mockedPipeline).toHaveBeenCalledWith(
        expect.any(Readable),
        client.stdout,
        { end: false }
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrPathname',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should save blob content to file with --output', async () => {
      const mockWriteStream = {} as fs.WriteStream;
      mockedCreateWriteStream.mockReturnValue(mockWriteStream);

      client.setArgv('blob', 'get', 'test-file.txt', '--output', './local.txt');

      const exitCode = await get(
        client,
        ['test-file.txt', '--output', './local.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.get).toHaveBeenCalledWith('test-file.txt', {
        token: testToken,
        access: 'public',
      });
      expect(mockedCreateWriteStream).toHaveBeenCalledWith('./local.txt');
      expect(mockedPipeline).toHaveBeenCalledWith(
        expect.any(Readable),
        mockWriteStream
      );
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'Saved to ./local.txt (17B), text/plain'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrPathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:output',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should use --access private', async () => {
      client.setArgv('blob', 'get', 'private-file.txt', '--access', 'private');

      const exitCode = await get(
        client,
        ['private-file.txt', '--access', 'private'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.get).toHaveBeenCalledWith('private-file.txt', {
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

    it('should handle URL as argument', async () => {
      const blobUrl = 'https://example.com/my-blob.txt';
      client.setArgv('blob', 'get', blobUrl);

      const exitCode = await get(client, [blobUrl], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.get).toHaveBeenCalledWith(blobUrl, {
        token: testToken,
        access: 'public',
      });
    });

    it('should show spinner only when --output is used', async () => {
      // Without --output: no spinner
      client.setArgv('blob', 'get', 'test-file.txt');
      await get(client, ['test-file.txt'], testToken);
      expect(mockedOutput.spinner).not.toHaveBeenCalled();

      vi.clearAllMocks();
      mockedBlob.get.mockResolvedValue(createMockGetResult());
      mockedPipeline.mockResolvedValue(undefined);
      const mockWriteStream = {} as fs.WriteStream;
      mockedCreateWriteStream.mockReturnValue(mockWriteStream);

      // With --output: show spinner
      client.setArgv('blob', 'get', 'test-file.txt', '--output', 'out.txt');
      await get(client, ['test-file.txt', '--output', 'out.txt'], testToken);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Downloading blob');
    });
  });

  describe('error cases', () => {
    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await get(client, [], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Missing required argument')
      );
      expect(mockedBlob.get).not.toHaveBeenCalled();
    });

    it('should return 1 when blob is not found', async () => {
      mockedBlob.get.mockResolvedValue(null);

      const exitCode = await get(client, ['nonexistent.txt'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Blob not found: nonexistent.txt'
      );
    });

    it('should return 1 when blob.get fails', async () => {
      mockedBlob.get.mockRejectedValue(new Error('Download failed'));

      const exitCode = await get(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(1);
    });

    it('should return 1 with invalid --access value', async () => {
      const exitCode = await get(
        client,
        ['test-file.txt', '--access', 'invalid'],
        testToken
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "Invalid access value: 'invalid'. Must be 'public' or 'private'."
      );
      expect(mockedBlob.get).not.toHaveBeenCalled();
    });

    it('should return 1 when argument parsing fails', async () => {
      const exitCode = await get(client, ['--invalid-flag'], testToken);
      expect(exitCode).toBe(1);
    });
  });

  describe('telemetry tracking', () => {
    it('should track all provided options', async () => {
      const mockWriteStream = {} as fs.WriteStream;
      mockedCreateWriteStream.mockReturnValue(mockWriteStream);

      const exitCode = await get(
        client,
        ['test-file.txt', '--access', 'private', '--output', 'out.txt'],
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

    it('should not track optional flags when not provided', async () => {
      const exitCode = await get(client, ['test-file.txt'], testToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).not.toHaveTelemetryEvents([
        {
          key: 'option:access',
          value: expect.any(String),
        },
      ]);
      expect(client.telemetryEventStore).not.toHaveTelemetryEvents([
        {
          key: 'option:output',
          value: expect.any(String),
        },
      ]);
    });
  });
});
