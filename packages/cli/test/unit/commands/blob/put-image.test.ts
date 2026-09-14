import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import putImage from '../../../../src/commands/blob/put-image';
import * as blobModule from '@vercel/blob';
import type { BlobRWToken } from '../../../../src/util/blob/token';
import output from '../../../../src/output-manager';
import * as path from 'node:path';
import { ReadStream } from 'node:fs';

vi.mock('@vercel/blob');
vi.mock('../../../../src/output-manager');

const mockedBlob = vi.mocked(blobModule);
const mockedOutput = vi.mocked(output);

describe('blob put-image', () => {
  const oidcAuth: BlobRWToken = {
    success: true,
    kind: 'oidc',
    oidcToken: 'test-oidc-token',
    storeId: 'store_abc123',
  };
  const rwAuth: BlobRWToken = {
    success: true,
    kind: 'rw',
    token: 'vercel_blob_rw_test_token_123',
  };

  const fixturesPath = path.join(__dirname, 'fixtures');
  const getFixturePath = (fileName: string) =>
    path.join(fixturesPath, fileName);

  const putResult = {
    url: 'https://example.com/optimized-image.webp',
    downloadUrl: 'https://example.com/optimized-image.webp?download=1',
    pathname: 'optimized-image.webp',
    contentType: 'image/webp',
    contentDisposition: 'inline; filename="optimized-image.webp"',
    etag: 'test-etag',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    mockedBlob.putImage.mockResolvedValue(putResult);
  });

  describe('local file source', () => {
    it('optimizes and uploads a local image', async () => {
      const testFile = getFixturePath('image.jpg');

      const exitCode = await putImage(
        client,
        [
          testFile,
          '--pathname',
          'images/photo.jpg',
          '--width',
          '800',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.putImage).toHaveBeenCalledWith(
        'images/photo.jpg',
        expect.any(ReadStream),
        {
          oidcToken: 'test-oidc-token',
          storeId: 'store_abc123',
          access: 'public',
          optimizeImage: { width: 800, quality: undefined, format: undefined },
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: undefined,
        }
      );
      expect(client.stdout.getFullOutput()).toBe(`${putResult.url}\n`);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:pathToFileOrUrl', value: '[REDACTED]' },
        { key: 'option:access', value: 'public' },
        { key: 'option:width', value: '800' },
        { key: 'option:pathname', value: '[REDACTED]' },
      ]);
    });

    it('errors when the file does not exist', async () => {
      const exitCode = await putImage(
        client,
        [
          './missing-image.jpg',
          '--pathname',
          'photo.jpg',
          '--width',
          '800',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        "File doesn't exist at './missing-image.jpg'"
      );
      expect(mockedBlob.putImage).not.toHaveBeenCalled();
    });

    it('errors when the path is not a file', async () => {
      const exitCode = await putImage(
        client,
        [
          fixturesPath,
          '--pathname',
          'photo.jpg',
          '--width',
          '800',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Path to optimize is not a file'
      );
      expect(mockedBlob.putImage).not.toHaveBeenCalled();
    });
  });

  describe('URL source', () => {
    it('optimizes and stores an image from a public URL', async () => {
      const exitCode = await putImage(
        client,
        [
          'https://example.com/images/hero.png',
          '--pathname',
          'images/hero.png',
          '--width',
          '1200',
          '--quality',
          '60',
          '--access',
          'private',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.putImage).toHaveBeenCalledWith(
        'images/hero.png',
        new URL('https://example.com/images/hero.png'),
        {
          oidcToken: 'test-oidc-token',
          storeId: 'store_abc123',
          access: 'private',
          optimizeImage: { width: 1200, quality: 60, format: undefined },
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: undefined,
        }
      );
      expect(client.stdout.getFullOutput()).toBe(`${putResult.url}\n`);
    });

    it('passes --format to the optimization options', async () => {
      const exitCode = await putImage(
        client,
        [
          'https://example.com/images/hero.png',
          '--pathname',
          'assets/hero-small.avif',
          '--width',
          '800',
          '--format',
          'avif',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(0);
      expect(mockedBlob.putImage).toHaveBeenCalledWith(
        'assets/hero-small.avif',
        new URL('https://example.com/images/hero.png'),
        expect.objectContaining({
          optimizeImage: { width: 800, quality: undefined, format: 'avif' },
        })
      );
    });
  });

  describe('optimization bypass warning', () => {
    it('warns when the stored content type does not match --format', async () => {
      mockedBlob.putImage.mockResolvedValue({
        ...putResult,
        pathname: 'images/photo.jpg',
        contentType: 'image/jpeg',
      });

      const exitCode = await putImage(
        client,
        [
          'https://example.com/house.jpg',
          '--pathname',
          'images/photo.png',
          '--width',
          '800',
          '--quality',
          '100',
          '--format',
          'webp',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.warn).toHaveBeenCalledWith(
        'The image was not converted to webp: it was stored unchanged as image/jpeg. This usually means the optimized output would have been larger than the source image. Try a lower --quality.'
      );
      expect(client.stdout.getFullOutput()).toBe(`${putResult.url}\n`);
    });

    it('does not warn when the stored content type matches --format', async () => {
      const exitCode = await putImage(
        client,
        [
          'https://example.com/house.jpg',
          '--pathname',
          'images/photo.webp',
          '--width',
          '800',
          '--format',
          'webp',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.warn).not.toHaveBeenCalled();
    });

    it('does not warn when --format was not requested', async () => {
      mockedBlob.putImage.mockResolvedValue({
        ...putResult,
        pathname: 'images/photo.jpg',
        contentType: 'image/jpeg',
      });

      const exitCode = await putImage(
        client,
        [
          'https://example.com/house.jpg',
          '--pathname',
          'images/photo.jpg',
          '--width',
          '800',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(0);
      expect(mockedOutput.warn).not.toHaveBeenCalled();
    });
  });

  describe('--json', () => {
    it('writes the stored blob as JSON to stdout', async () => {
      const exitCode = await putImage(
        client,
        [
          'https://example.com/images/hero.png',
          '--pathname',
          'hero.png',
          '--width',
          '800',
          '--access',
          'public',
          '--json',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        url: putResult.url,
        downloadUrl: putResult.downloadUrl,
        pathname: putResult.pathname,
        contentType: putResult.contentType,
      });
    });
  });

  describe('validation', () => {
    it('errors when the source argument is missing', async () => {
      const exitCode = await putImage(
        client,
        ['--pathname', 'photo.jpg', '--width', '800', '--access', 'public'],
        oidcAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedBlob.putImage).not.toHaveBeenCalled();
    });

    it('errors when --pathname is missing', async () => {
      const exitCode = await putImage(
        client,
        ['image.jpg', '--width', '800', '--access', 'public'],
        oidcAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        'Missing required --pathname flag. Set the pathname to store the optimized image at in the Blob store.'
      );
      expect(mockedBlob.putImage).not.toHaveBeenCalled();
    });

    it.each([
      '--multipart',
      '--if-match',
    ])('rejects %s as an unknown option', async unknownFlag => {
      const exitCode = await putImage(
        client,
        [
          'image.jpg',
          '--pathname',
          'photo.jpg',
          '--width',
          '800',
          unknownFlag,
          'value',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedBlob.putImage).not.toHaveBeenCalled();
    });

    it('passes optimize params through without client-side validation', async () => {
      const exitCode = await putImage(
        client,
        [
          'https://example.com/hero.png',
          '--pathname',
          'photo.tiff',
          '--width',
          '10000',
          '--quality',
          '500',
          '--format',
          'tiff',
          '--access',
          'public',
        ],
        oidcAuth
      );

      // Validation lives in the SDK and the API; the mocked SDK accepts it.
      expect(exitCode).toBe(0);
      expect(mockedBlob.putImage).toHaveBeenCalledWith(
        'photo.tiff',
        expect.any(URL),
        expect.objectContaining({
          optimizeImage: { width: 10000, quality: 500, format: 'tiff' },
        })
      );
    });

    it('errors when --access is missing', async () => {
      const exitCode = await putImage(
        client,
        ['image.jpg', '--pathname', 'photo.jpg', '--width', '800'],
        oidcAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedBlob.putImage).not.toHaveBeenCalled();
    });
  });

  describe('auth', () => {
    it('rejects read-write token auth with an actionable error', async () => {
      const exitCode = await putImage(
        client,
        [
          'image.jpg',
          '--pathname',
          'photo.jpg',
          '--width',
          '800',
          '--access',
          'public',
        ],
        rwAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.error).toHaveBeenCalledWith(
        expect.stringContaining('Image optimization requires OIDC credentials')
      );
      expect(mockedBlob.putImage).not.toHaveBeenCalled();
    });
  });

  describe('errors from the SDK', () => {
    it('returns 1 and prints the error when the upload fails', async () => {
      mockedBlob.putImage.mockRejectedValue(new Error('Upload failed'));

      const exitCode = await putImage(
        client,
        [
          'https://example.com/hero.png',
          '--pathname',
          'hero.png',
          '--width',
          '800',
          '--access',
          'public',
        ],
        oidcAuth
      );

      expect(exitCode).toBe(1);
      expect(mockedOutput.stopSpinner).toHaveBeenCalled();
      expect(client.stdout.getFullOutput()).toBe('');
    });
  });
});
