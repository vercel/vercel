import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import put from '../../../../src/commands/blob/put';
import * as blobModule from '@vercel/blob';
import * as getBlobRWTokenModule from '../../../../src/util/blob/token';
import output from '../../../../src/output-manager';
import * as fs from 'node:fs';

// Mock the external dependencies
vi.mock('@vercel/blob');
vi.mock('../../../../src/util/blob/token');
vi.mock('../../../../src/output-manager');
vi.mock('node:fs');

const mockedBlob = vi.mocked(blobModule);
const mockedGetBlobRWToken = vi.mocked(getBlobRWTokenModule.getBlobRWToken);
const mockedOutput = vi.mocked(output);
const mockedFs = vi.mocked(fs);

describe('blob put', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    // Default successful mocks
    mockedGetBlobRWToken.mockResolvedValue('test-token');
    mockedBlob.put.mockResolvedValue({
      url: 'https://example.com/uploaded-file.txt',
      downloadUrl: 'https://example.com/uploaded-file.txt',
      pathname: 'uploaded-file.txt',
      contentType: 'text/plain',
      contentDisposition: 'attachment; filename="uploaded-file.txt"',
    });

    // Mock filesystem operations
    mockedFs.statSync.mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as fs.Stats);
    mockedFs.readFileSync.mockReturnValue(Buffer.from('test file content'));
  });

  describe('successful upload', () => {
    it('should upload file successfully with default options', async () => {
      client.setArgv('blob', 'put', 'test-file.txt');

      const exitCode = await put(client, ['test-file.txt']);

      expect(exitCode).toBe(0);
      expect(mockedGetBlobRWToken).toHaveBeenCalledWith(client);
      expect(mockedFs.statSync).toHaveBeenCalledWith('test-file.txt');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith('test-file.txt');
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test-file.txt',
        Buffer.from('test file content'),
        {
          token: 'test-token',
          access: 'public',
          addRandomSuffix: false,
          multipart: true,
          contentType: undefined,
          cacheControlMaxAge: undefined,
          allowOverwrite: false,
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
        'test-file.txt'
      );

      const exitCode = await put(client, [
        '--add-random-suffix',
        '--pathname',
        'custom-name.txt',
        '--multipart',
        '--content-type',
        'text/plain',
        '--cache-control-max-age',
        '3600',
        '--force',
        'test-file.txt',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'custom-name.txt',
        Buffer.from('test file content'),
        {
          token: 'test-token',
          access: 'public',
          addRandomSuffix: true,
          multipart: true,
          contentType: 'text/plain',
          cacheControlMaxAge: 3600,
          allowOverwrite: true,
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
      const exitCode = await put(client, ['path/to/myfile.pdf']);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'myfile.pdf',
        Buffer.from('test file content'),
        {
          token: 'test-token',
          access: 'public',
          addRandomSuffix: false,
          multipart: true,
          contentType: undefined,
          cacheControlMaxAge: undefined,
          allowOverwrite: false,
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
        const exitCode = await put(client, [filename]);
        expect(exitCode).toBe(0);
        expect(mockedFs.readFileSync).toHaveBeenCalledWith(filename);
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

      const exitCode = await put(client, ['--invalid-flag']);
      expect(exitCode).toBe(1);
    });

    it('should return 1 when no arguments are provided', async () => {
      const exitCode = await put(client, []);

      expect(exitCode).toBe(1);
      expect(mockedBlob.put).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when token is not available', async () => {
      mockedGetBlobRWToken.mockResolvedValue(undefined);

      const exitCode = await put(client, ['test-file.txt']);

      expect(exitCode).toBe(1);
      expect(mockedBlob.put).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });

    it('should return 1 when file does not exist', async () => {
      const fileError = new Error(
        'ENOENT: no such file or directory'
      ) as NodeJS.ErrnoException;
      fileError.code = 'ENOENT';
      mockedFs.statSync.mockImplementation(() => {
        throw fileError;
      });

      const exitCode = await put(client, ['nonexistent-file.txt']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "File doesn't exist at 'nonexistent-file.txt'"
      );
      expect(mockedBlob.put).not.toHaveBeenCalled();
    });

    it('should return 1 when path is a directory', async () => {
      mockedFs.statSync.mockReturnValue({
        isFile: () => false,
        isDirectory: () => true,
      } as fs.Stats);

      const exitCode = await put(client, ['some-directory']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Path to upload is not a file'
      );
      expect(mockedBlob.put).not.toHaveBeenCalled();
    });

    it('should return 1 when file reading fails', async () => {
      const readError = new Error('Permission denied');
      mockedFs.readFileSync.mockImplementation(() => {
        throw readError;
      });

      const exitCode = await put(client, ['test-file.txt']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Error while reading file'
      );
      expect(mockedBlob.put).not.toHaveBeenCalled();
    });

    it('should return 1 when blob upload fails', async () => {
      const uploadError = new Error('Upload failed');
      mockedBlob.put.mockRejectedValue(uploadError);

      const exitCode = await put(client, ['test-file.txt']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
      expect(mockedOutput.success).not.toHaveBeenCalled();
    });
  });

  describe('flag and option handling', () => {
    it('should handle --add-random-suffix flag', async () => {
      const exitCode = await put(client, ['--add-random-suffix', 'test.txt']);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'test.txt',
        expect.any(Buffer),
        expect.objectContaining({ addRandomSuffix: true })
      );
    });

    it('should handle --pathname option', async () => {
      const exitCode = await put(client, [
        '--pathname',
        'custom/path.txt',
        'original.txt',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'custom/path.txt',
        expect.any(Buffer),
        expect.objectContaining({})
      );
    });

    it('should handle --content-type option', async () => {
      const exitCode = await put(client, [
        '--content-type',
        'image/jpeg',
        'image.jpg',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'image.jpg',
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'image/jpeg' })
      );
    });

    it('should handle --cache-control-max-age option', async () => {
      const exitCode = await put(client, [
        '--cache-control-max-age',
        '86400',
        'file.txt',
      ]);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'file.txt',
        expect.any(Buffer),
        expect.objectContaining({ cacheControlMaxAge: 86400 })
      );
    });

    it('should handle --force flag', async () => {
      const exitCode = await put(client, ['--force', 'file.txt']);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'file.txt',
        expect.any(Buffer),
        expect.objectContaining({ allowOverwrite: true })
      );
    });

    it('should handle --multipart flag (enabled by default)', async () => {
      const exitCode = await put(client, ['--multipart', 'file.txt']);

      expect(exitCode).toBe(0);
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'file.txt',
        expect.any(Buffer),
        expect.objectContaining({ multipart: true })
      );
    });
  });

  describe('telemetry tracking', () => {
    it('should track file argument', async () => {
      const exitCode = await put(client, ['test-file.txt']);

      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:pathToFile',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should not track optional flags when not provided', async () => {
      const exitCode = await put(client, ['test-file.txt']);

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
      const exitCode = await put(client, [
        '--add-random-suffix',
        '--pathname',
        'custom.txt',
        '--content-type',
        'application/octet-stream',
        '--cache-control-max-age',
        '7200',
        '--force',
        'source.bin',
      ]);

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
      const testContent = 'Hello, World!';
      mockedFs.readFileSync.mockReturnValue(Buffer.from(testContent));

      const exitCode = await put(client, ['hello.txt']);

      expect(exitCode).toBe(0);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith('hello.txt');
      expect(mockedBlob.put).toHaveBeenCalledWith(
        'hello.txt',
        Buffer.from(testContent),
        expect.any(Object)
      );
    });

    it('should handle various file paths', async () => {
      const filePaths = [
        'simple.txt',
        'folder/file.txt',
        './relative/path.txt',
        '/absolute/path.txt',
        '../parent/file.txt',
      ];

      for (const filePath of filePaths) {
        const exitCode = await put(client, [filePath]);
        expect(exitCode).toBe(0);
        expect(mockedFs.statSync).toHaveBeenCalledWith(filePath);
        expect(mockedFs.readFileSync).toHaveBeenCalledWith(filePath);
      }
    });
  });

  describe('spinner and output behavior', () => {
    it('should show spinner during upload and stop on success', async () => {
      const exitCode = await put(client, ['test.txt']);

      expect(exitCode).toBe(0);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(mockedOutput.success).toHaveBeenCalledWith(
        'https://example.com/uploaded-file.txt'
      );
    });

    it('should not stop spinner on upload error', async () => {
      const uploadError = new Error('Network error');
      mockedBlob.put.mockRejectedValue(uploadError);

      const exitCode = await put(client, ['test.txt']);

      expect(exitCode).toBe(1);
      expect(mockedOutput.spinner).toHaveBeenCalledWith('Uploading blob');
      expect(mockedOutput.stopSpinner).not.toHaveBeenCalled();
    });
  });
});
