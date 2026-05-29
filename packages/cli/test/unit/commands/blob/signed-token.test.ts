import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as blobModule from '@vercel/blob';
import signedToken from '../../../../src/commands/blob/signed-token';
import output from '../../../../src/output-manager';
import { client } from '../../../mocks/client';
import type { BlobRWToken } from '../../../../src/util/blob/token';

vi.mock('@vercel/blob');
vi.mock('../../../../src/output-manager');

const mockedBlob = vi.mocked(blobModule);
const mockedOutput = vi.mocked(output);

describe('blob signed-token', () => {
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
  });

  it('should issue a signed token with basic options', async () => {
    const exitCode = await signedToken(
      client,
      ['--pathname', 'media/photo.jpg', '--operation', 'get'],
      testAuth
    );

    expect(exitCode).toBe(0);
    expect(mockedBlob.issueSignedToken).toHaveBeenCalledWith({
      token: 'vercel_blob_rw_test_token_123',
      pathname: 'media/photo.jpg',
      operations: ['get'],
      validUntil: undefined,
      allowedContentTypes: undefined,
      maximumSizeInBytes: undefined,
    });
    expect(mockedOutput.print).toHaveBeenCalledWith(
      expect.stringContaining('delegationToken=delegation-token')
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:pathname', value: '[REDACTED]' },
      { key: 'option:operation', value: 'get' },
    ]);
  });

  it('should support json output', async () => {
    const exitCode = await signedToken(
      client,
      ['--pathname', 'uploads/*', '--operation', 'put', '--json'],
      testAuth
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      delegationToken: 'delegation-token',
      clientSigningToken: 'client-signing-token',
      validUntil: 1761938400000,
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:pathname', value: '[REDACTED]' },
      { key: 'option:operation', value: 'put' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('should pass upload constraints', async () => {
    const exitCode = await signedToken(
      client,
      [
        '--operation',
        'put',
        '--allowed-content-type',
        'image/*',
        '--allowed-content-type',
        'video/*',
        '--maximum-size-in-bytes',
        '1048576',
      ],
      testAuth
    );

    expect(exitCode).toBe(0);
    expect(mockedBlob.issueSignedToken).toHaveBeenCalledWith({
      token: 'vercel_blob_rw_test_token_123',
      pathname: undefined,
      operations: ['put'],
      validUntil: undefined,
      allowedContentTypes: ['image/*', 'video/*'],
      maximumSizeInBytes: 1048576,
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:operation', value: 'put' },
      { key: 'option:allowed-content-type', value: 'image/*,video/*' },
      { key: 'option:maximum-size-in-bytes', value: '1048576' },
    ]);
  });

  it('should reject invalid operation values', async () => {
    const exitCode = await signedToken(
      client,
      ['--operation', 'invalid-op'],
      testAuth
    );

    expect(exitCode).toBe(1);
    expect(mockedBlob.issueSignedToken).not.toHaveBeenCalled();
    expect(mockedOutput.error).toHaveBeenCalledWith(
      "Invalid operation value: 'invalid-op'. Must be one of: get, head, put, delete."
    );
  });

  it('should return 1 when SDK call fails', async () => {
    mockedBlob.issueSignedToken.mockRejectedValue(new Error('Request failed'));

    const exitCode = await signedToken(
      client,
      ['--operation', 'get'],
      testAuth
    );

    expect(exitCode).toBe(1);
    expect(mockedOutput.stopSpinner).toHaveBeenCalled();
  });
});
