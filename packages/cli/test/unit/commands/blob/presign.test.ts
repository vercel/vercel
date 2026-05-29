import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as blobModule from '@vercel/blob';
import presign from '../../../../src/commands/blob/presign';
import output from '../../../../src/output-manager';
import { client } from '../../../mocks/client';
import type { BlobRWToken } from '../../../../src/util/blob/token';

vi.mock('@vercel/blob');
vi.mock('../../../../src/output-manager');

const mockedBlob = vi.mocked(blobModule);
const mockedOutput = vi.mocked(output);

describe('blob presign', () => {
  const testAuth: BlobRWToken = {
    success: true,
    kind: 'rw',
    token: 'vercel_blob_rw_test_token_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();

    mockedBlob.issueSignedToken.mockResolvedValue({
      delegationToken: 'delegation-token',
      clientSigningToken: 'client-signing-token',
      validUntil: 1761938400000,
    });
    mockedBlob.presignUrl.mockResolvedValue({
      presignedUrl: 'https://blob.vercel-storage.com/presigned-url',
    });
  });

  it('should generate a presigned get URL by default', async () => {
    const exitCode = await presign(
      client,
      ['my-file.txt', '--access', 'public'],
      testAuth
    );

    expect(exitCode).toBe(0);
    expect(mockedBlob.issueSignedToken).toHaveBeenCalledWith({
      token: 'vercel_blob_rw_test_token_123',
      pathname: 'my-file.txt',
      operations: ['get'],
      validUntil: undefined,
    });
    expect(mockedBlob.presignUrl).toHaveBeenCalledWith(
      {
        delegationToken: 'delegation-token',
        clientSigningToken: 'client-signing-token',
      },
      {
        operation: 'get',
        pathname: 'my-file.txt',
        access: 'public',
        validUntil: undefined,
      }
    );
    expect(mockedOutput.print).toHaveBeenCalledWith(
      'https://blob.vercel-storage.com/presigned-url\n'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:pathname', value: '[REDACTED]' },
      { key: 'option:access', value: 'public' },
    ]);
  });

  it('should generate a presigned put URL with constraints', async () => {
    const exitCode = await presign(
      client,
      [
        'uploads/image.jpg',
        '--access',
        'private',
        '--operation',
        'put',
        '--valid-until',
        '1761938300000',
        '--allowed-content-type',
        'image/*',
        '--maximum-size-in-bytes',
        '1048576',
        '--allow-overwrite',
        '--add-random-suffix',
        '--cache-control-max-age',
        '3600',
        '--if-match',
        '"etag"',
        '--json',
      ],
      testAuth
    );

    expect(exitCode).toBe(0);
    expect(mockedBlob.issueSignedToken).toHaveBeenCalledWith({
      token: 'vercel_blob_rw_test_token_123',
      pathname: 'uploads/image.jpg',
      operations: ['put'],
      validUntil: 1761938300000,
      allowedContentTypes: ['image/*'],
      maximumSizeInBytes: 1048576,
    });
    expect(mockedBlob.presignUrl).toHaveBeenCalledWith(
      {
        delegationToken: 'delegation-token',
        clientSigningToken: 'client-signing-token',
      },
      {
        operation: 'put',
        pathname: 'uploads/image.jpg',
        access: 'private',
        validUntil: 1761938300000,
        allowedContentTypes: ['image/*'],
        maximumSizeInBytes: 1048576,
        allowOverwrite: true,
        addRandomSuffix: true,
        cacheControlMaxAge: 3600,
        ifMatch: '"etag"',
      }
    );
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      operation: 'put',
      presignedUrl: 'https://blob.vercel-storage.com/presigned-url',
      validUntil: 1761938400000,
    });
  });

  it('should use provided signed-token values when both are passed', async () => {
    const exitCode = await presign(
      client,
      [
        'uploads/image.jpg',
        '--access',
        'private',
        '--operation',
        'put',
        '--delegation-token',
        'provided-delegation-token',
        '--client-signing-token',
        'provided-client-signing-token',
        '--json',
      ],
      testAuth
    );

    expect(exitCode).toBe(0);
    expect(mockedBlob.issueSignedToken).not.toHaveBeenCalled();
    expect(mockedBlob.presignUrl).toHaveBeenCalledWith(
      {
        delegationToken: 'provided-delegation-token',
        clientSigningToken: 'provided-client-signing-token',
      },
      {
        operation: 'put',
        pathname: 'uploads/image.jpg',
        access: 'private',
        validUntil: undefined,
        allowedContentTypes: undefined,
        maximumSizeInBytes: undefined,
        allowOverwrite: undefined,
        addRandomSuffix: undefined,
        cacheControlMaxAge: undefined,
        ifMatch: undefined,
      }
    );
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      operation: 'put',
      presignedUrl: 'https://blob.vercel-storage.com/presigned-url',
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'argument:pathname', value: '[REDACTED]' },
      { key: 'option:access', value: 'private' },
      { key: 'option:operation', value: 'put' },
      { key: 'option:delegation-token', value: '[REDACTED]' },
      { key: 'option:client-signing-token', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('should reject upload-only flags on read operations', async () => {
    const exitCode = await presign(
      client,
      [
        'my-file.txt',
        '--access',
        'public',
        '--operation',
        'get',
        '--maximum-size-in-bytes',
        '1024',
      ],
      testAuth
    );

    expect(exitCode).toBe(1);
    expect(mockedBlob.issueSignedToken).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'The flags --allowed-content-type, --maximum-size-in-bytes, --allow-overwrite, --add-random-suffix, and --cache-control-max-age can only be used with --operation put.'
    );
  });

  it('should reject if-match for get/head operations', async () => {
    const exitCode = await presign(
      client,
      [
        'my-file.txt',
        '--access',
        'public',
        '--operation',
        'head',
        '--if-match',
        '"etag"',
      ],
      testAuth
    );

    expect(exitCode).toBe(1);
    expect(mockedBlob.issueSignedToken).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'The --if-match flag can only be used with --operation put or --operation delete.'
    );
  });

  it('should require pathname argument', async () => {
    const exitCode = await presign(client, ['--access', 'public'], testAuth);

    expect(exitCode).toBe(1);
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'Missing required argument: pathname'
    );
  });

  it('should require both token flags together', async () => {
    const exitCode = await presign(
      client,
      [
        'my-file.txt',
        '--access',
        'public',
        '--delegation-token',
        'provided-delegation-token',
      ],
      testAuth
    );

    expect(exitCode).toBe(1);
    expect(mockedBlob.issueSignedToken).not.toHaveBeenCalled();
    expect(mockedBlob.presignUrl).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      'The --delegation-token and --client-signing-token flags must be passed together. Pass both, or pass neither to issue a token automatically.'
    );
  });

  it('should return 1 when SDK call fails', async () => {
    mockedBlob.presignUrl.mockRejectedValue(new Error('Presign failed'));

    const exitCode = await presign(
      client,
      ['my-file.txt', '--access', 'public'],
      testAuth
    );

    expect(exitCode).toBe(1);
    expect(mockedOutput.stopSpinner).toHaveBeenCalled();
  });
});
