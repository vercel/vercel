import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  awsCredentialsProvider,
  type AwsCredentialsProviderInit,
} from './aws-credentials-provider';

const { getToken, exchangeToken, fromWebToken, credentials } = vi.hoisted(
  () => ({
    getToken: vi.fn(),
    exchangeToken: vi.fn(),
    fromWebToken: vi.fn(),
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  })
);
vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: getToken,
  exchangeVercelAwsOidcToken: exchangeToken,
}));
vi.mock('@aws-sdk/credential-provider-web-identity', () => ({ fromWebToken }));

beforeEach(() => {
  getToken.mockReset().mockResolvedValue('standard-token');
  exchangeToken.mockReset().mockResolvedValue('immutable-token');
  fromWebToken.mockReset().mockReturnValue(async () => credentials);
});

describe('awsCredentialsProvider', () => {
  it('preserves the standard flow by default', async () => {
    expect(await awsCredentialsProvider({ roleArn: 'test-role' })()).toBe(
      credentials
    );
    expect(getToken).toHaveBeenCalledWith(undefined);
    expect(exchangeToken).not.toHaveBeenCalled();
    expect(fromWebToken).toHaveBeenCalledWith({
      roleArn: 'test-role',
      webIdentityToken: 'standard-token',
    });
  });

  it('preserves custom audience options', async () => {
    await awsCredentialsProvider({
      roleArn: 'test-role',
      audience: 'custom',
      jti: 'id',
      skipTokenCache: true,
    })();
    expect(getToken).toHaveBeenCalledWith({
      audience: 'custom',
      jti: 'id',
      skipCache: true,
    });
    expect(exchangeToken).not.toHaveBeenCalled();
  });

  it('uses immutable identity only when enabled and preserves STS options', async () => {
    expect(
      await awsCredentialsProvider({
        roleArn: 'test-role',
        roleSessionName: 'session',
        durationSeconds: 900,
        enableProjectIdentity: true,
        skipTokenCache: true,
      })()
    ).toBe(credentials);
    expect(exchangeToken).toHaveBeenCalledWith({
      token: 'standard-token',
      skipCache: true,
    });
    expect(fromWebToken).toHaveBeenCalledWith({
      roleArn: 'test-role',
      roleSessionName: 'session',
      durationSeconds: 900,
      webIdentityToken: 'immutable-token',
    });
  });

  it('does not call STS when the identity exchange fails', async () => {
    exchangeToken.mockRejectedValue(new Error('Exchange denied'));
    await expect(
      awsCredentialsProvider({
        roleArn: 'test-role',
        enableProjectIdentity: true,
      })()
    ).rejects.toThrow('Exchange denied');
    expect(fromWebToken).not.toHaveBeenCalled();
  });

  it.each([
    { audience: 'custom' },
    { jti: 'id' },
  ])('rejects incompatible JavaScript options %j', options => {
    expect(() =>
      awsCredentialsProvider({
        roleArn: 'test-role',
        enableProjectIdentity: true,
        ...options,
      } as unknown as AwsCredentialsProviderInit)
    ).toThrow('cannot be combined');
    expect(getToken).not.toHaveBeenCalled();
    expect(fromWebToken).not.toHaveBeenCalled();
  });
});
