import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import put from '../../../../src/commands/blob/put';
import * as blobModule from '@vercel/blob';
import * as getBlobRWTokenModule from '../../../../src/util/blob/token';
import output from '../../../../src/output-manager';
import * as path from 'node:path';
import { ReadStream } from 'node:fs';

// Mock the external dependencies
vi.mock('@vercel/blob');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');

const mockedBlob = vi.mocked(blobModule);
const mockedGetBlobRWToken = vi.mocked(getBlobRWTokenModule.getBlobRWToken);
const mockedOutput = vi.mocked(output);

describe('blob put', () => {
  const testToken = 'vercel_blob_rw_test_token_123';
  const fixturesPath = path.join(__dirname, 'fixtures');

  // Helper function to get fixture path
  const getFixturePath = (fileName: string) =>
    path.join(fixturesPath, fileName);

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue({
      token: testToken,
      success: true,
    });
    mockedBlob.put.mockResolvedValue({
      url: 'https://example.com/uploaded-file.txt',
      downloadUrl: 'https://example.com/uploaded-file.txt',
      pathname: 'uploaded-file.txt',
      contentType: 'text/plain',
      contentDisposition: 'attachment; filename="uploaded-file.txt"',
      etag: 'test-etag',
    });
  });

  describe('successful upload', () => {
    it('should upload file successfully with default options', async () => {
      const testFile = getFixturePath('test-file.txt');
      client.setArgv('blob', 'put', testFile);

      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        {
          token: testToken,
          access: 'public',
          addRandomSuffix: false,
          multipart: true,
          contentType: undefined,
          cacheControlMaxAge: undefined,
          allowOverwrite: false,
          ifMatch: undefined,
        }
      );
      expect(mockedOutput.debug).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'https://example.com/uploaded-file.txt'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:pathToFile',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should upload file with all flags and options', async () => {
      const testFile = getFixturePath('test-file.txt');
      client.setArgv(
        'blob',
        'put',
        '--add-random-suffix',
        '--pathname',
        'custom-name.txt',
        '--multipart',
        '--content-type',
        'text/plain',
        '--cache-control-max-age',
        '3600',
        '--force',
        testFile
      );

      const exitCode = await put(
        client,
        [
          '--add-random-suffix',
          '--pathname',
          'custom-name.txt',
          '--multipart',
          '--content-type',
          'text/plain',
          '--cache-control-max-age',
          '3600',
          '--force',
          testFile,
        ],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'custom-name.txt',
        expect.any(ReadStream),
        {
          token: testToken,
          access: 'public',
          addRandomSuffix: true,
          multipart: true,
          contentType: 'text/plain',
          cacheControlMaxAge: 3600,
          allowOverwrite: true,
          ifMatch: undefined,
        }
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:pathToFile',
          value: '[REDACTED]',
        },
        {
          key: 'flag:add-random-suffix',
          value: 'TRUE',
        },
        {
          key: 'option:pathname',
          value: '[REDACTED]',
        },
        {
          key: 'flag:multipart',
          value: 'TRUE',
        },
        {
          key: 'option:content-type',
          value: 'text/plain',
        },
        {
          key: 'option:cache-control-max-age',
          value: '3600',
        },
        {
          key: 'flag:force',
          value: 'TRUE',
        },
      ]);
    });

    it('should use filename as pathname when no --pathname provided', async () => {
      const testFile = getFixturePath('path/to/myfile.pdf');
      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'myfile.pdf',
        expect.any(ReadStream),
        {
          token: testToken,
          access: 'public',
          addRandomSuffix: false,
          multipart: true,
          contentType: undefined,
          cacheControlMaxAge: undefined,
          allowOverwrite: false,
          ifMatch: undefined,
        }
      );
    });

    it('should handle different file types', async () => {
      const testCases = [
        'image.jpg',
        'document.pdf',
        'data.json',
        'archive.zip',
        'video.mp4',
      ];

      for (const filename of testCases) {
        const testFile = getFixturePath(filename);
        const exitCode = await put(client, [testFile], testToken);
        expect(exitCode).toBe(0);
      }
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

      const exitCode = await put(client, ['--invalid-flag'], testToken);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await put(client, [], testToken);

      expect(exitCode).toBe(1);
      expect(mockedBlob.put).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when file does not exist', async () => {
      const exitCode = await put(client, ['nonexistent-file.txt'], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "File doesn't exist at 'nonexistent-file.txt'"
      );
      expect(mockedBlob.put).not.toHaveBeenCalled();
    });

    it('should return 1 when path is a directory', async () => {
      const testDir = getFixturePath('some-directory');
      const exitCode = await put(client, [testDir], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Path to upload is not a file'
      );
      expect(mockedBlob.put).not.toHaveBeenCalled();
    });

    it('should return 1 when blob upload fails', async () => {
      const testFile = getFixturePath('test-file.txt');
      const uploadError = new Error('Upload failed');
      mockedBlob.put.mockRejectedValue(uploadError);

      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });
  });

  describe('flag and option handling', () => {
    it('should handle --add-random-suffix flag', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        ['--add-random-suffix', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ addRandomSuffix: true })
      );
    });

    it('should handle --pathname option', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        ['--pathname', 'custom/path.txt', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'custom/path.txt',
        expect.any(ReadStream),
        expect.objectContaining({})
      );
    });

    it('should handle --content-type option', async () => {
      const testFile = getFixturePath('image.jpg');
      const exitCode = await put(
        client,
        ['--content-type', 'image/jpeg', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'image.jpg',
        expect.any(ReadStream),
        expect.objectContaining({ contentType: 'image/jpeg' })
      );
    });

    it('should handle --cache-control-max-age option', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        ['--cache-control-max-age', '86400', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ cacheControlMaxAge: 86400 })
      );
    });

    it('should handle --force flag', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(client, ['--force', testFile], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ allowOverwrite: true })
      );
    });

    it('should handle --access private option', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        ['--access', 'private', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ access: 'private' })
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:pathToFile',
          value: '[REDACTED]',
        },
        {
          key: 'option:access',
          value: 'private',
        },
      ]);
    });

    it('should handle --allow-overwrite flag', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        ['--allow-overwrite', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ allowOverwrite: true })
      );
    });

    it('should show deprecation warning when --force is used', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(client, ['--force', testFile], testToken);

      expect(exitCode).toBe(0);
      expect(mockedOutput.warn).toHaveBeenCalledWith(
        '--force is deprecated, use --allow-overwrite instead'
      );
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ allowOverwrite: true })
      );
    });

    it('should prefer --allow-overwrite over --force', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        ['--allow-overwrite', '--force', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ allowOverwrite: true })
      );
    });

    it('should handle --if-match option', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        ['--if-match', '"some-etag"', testFile],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ ifMatch: '"some-etag"' })
      );
    });

    it('should handle --multipart flag (enabled by default)', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(client, ['--multipart', testFile], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        expect.any(ReadStream),
        expect.objectContaining({ multipart: true })
      );
    });
  });

  describe('telemetry tracking', () => {
    it('should track file argument', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:pathToFile',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should not track optional flags when not provided', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(0);
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

    it('should track all provided options correctly', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(
        client,
        [
          '--add-random-suffix',
          '--pathname',
          'custom.txt',
          '--content-type',
          'application/octet-stream',
          '--cache-control-max-age',
          '7200',
          '--force',
          testFile,
        ],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:pathToFile',
          value: '[REDACTED]',
        },
        {
          key: 'flag:add-random-suffix',
          value: 'TRUE',
        },
        {
          key: 'option:pathname',
          value: '[REDACTED]',
        },
        {
          key: 'option:content-type',
          value: 'application/octet-stream',
        },
        {
          key: 'option:cache-control-max-age',
          value: '7200',
        },
        {
          key: 'flag:force',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('file system operations', () => {
    it('should read file content as Buffer', async () => {
      const testFile = getFixturePath('hello.txt');
      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'hello.txt',
        expect.any(ReadStream),
        expect.any(Object)
      );
    });

    it('should handle various file paths', async () => {
      const filePaths = ['test-file.txt', 'folder/file.txt'];

      for (const filePath of filePaths) {
        const testFile = getFixturePath(filePath);
        const exitCode = await put(client, [testFile], testToken);
        expect(exitCode).toBe(0);
      }
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during upload and stop on success', async () => {
      const testFile = getFixturePath('test-file.txt');
      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'https://example.com/uploaded-file.txt'
      );
    });

    it('should not stop spinner on upload error', async () => {
      const testFile = getFixturePath('test-file.txt');
      const uploadError = new Error('Network error');
      mockedBlob.put.mockRejectedValue(uploadError);

      const exitCode = await put(client, [testFile], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
    });
  });

  describe('stdin input', () => {
    beforeEach(() => {
      // Mock stdin to not be a TTY (simulating piped input)
      client.stdin.isTTY = false;
    });

    it('should upload from stdin with pathname successfully', async () => {
      const exitCode = await put(
        client,
        ['--pathname', 'from-stdin.txt'],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'from-stdin.txt',
        process.stdin,
        {
          token: testToken,
          access: 'public',
          addRandomSuffix: false,
          multipart: true,
          contentType: undefined,
          cacheControlMaxAge: undefined,
          allowOverwrite: false,
          ifMatch: undefined,
        }
      );
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'https://example.com/uploaded-file.txt'
      );
    });

    it('should fail when reading from stdin without pathname', async () => {
      const exitCode = await put(client, [], testToken);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Missing pathname. When reading from stdin, you must specify --pathname. Usage: cat file.txt | vercel blob put --pathname <pathname>'
      );
      expect(mockedBlob.put).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should upload from stdin with all options', async () => {
      const exitCode = await put(
        client,
        [
          '--pathname',
          'custom-stdin.txt',
          '--add-random-suffix',
          '--content-type',
          'text/plain',
          '--cache-control-max-age',
          '3600',
          '--force',
        ],
        testToken
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'custom-stdin.txt',
        process.stdin,
        {
          token: testToken,
          access: 'public',
          addRandomSuffix: true,
          multipart: true,
          contentType: 'text/plain',
          cacheControlMaxAge: 3600,
          allowOverwrite: true,
          ifMatch: undefined,
        }
      );
    });
  });
});
