import { beforeEach, describe, expect, it, vi } from 'vitest';
import { awsCredentialsProvider } from '../../../src/oidc';

const getVercelOidcTokenSyncMock = vi.fn().mockReturnValue('token');
const exchangeTokenMock = vi.fn().mockResolvedValue('immutable-token');
const fromWebTokenExectionMock = vi.fn();
const fromWebTokenMock = vi.fn().mockReturnValue(fromWebTokenExectionMock);

vi.mock('@vercel/oidc', () => {
  return {
    getVercelOidcTokenSync: () => getVercelOidcTokenSyncMock(),
    getVercelOidcToken: vi.fn(),
    exchangeVercelAwsOidcToken: (...args: unknown[]) =>
      exchangeTokenMock(...args),
  };
});

vi.mock('@aws-sdk/credential-provider-web-identity', () => {
  return {
    fromWebToken: (...args: unknown[]) => fromWebTokenMock(...args),
  };
});

describe('awsCredentialsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeTokenMock.mockResolvedValue('immutable-token');
  });

  it('returns a function', () => {
    expect(awsCredentialsProvider({ roleArn: 'roleArn' })).toBeInstanceOf(
      Function
    );
  });

  it('calls fromWebToken with the correct arguments', async () => {
    const init = {
      roleArn: 'roleArn',
      roleSessionName: 'roleSessionName',
    };
    const fn = awsCredentialsProvider(init);
    await fn();

    expect(fromWebTokenMock).toHaveBeenCalledWith({
      ...init,
      webIdentityToken: getVercelOidcTokenSyncMock(),
    });
  });

  it('calls the function returned by fromWebToken', async () => {
    const init = {
      roleArn: 'roleArn',
      roleSessionName: 'roleSessionName',
    };
    const fn = awsCredentialsProvider(init);
    await fn();

    expect(fromWebTokenExectionMock).toHaveBeenCalled();
  });
  it('uses immutable AWS identity when enabled', async () => {
    await awsCredentialsProvider({
      roleArn: 'roleArn',
      enableProjectIdentity: true,
    })();
    expect(exchangeTokenMock).toHaveBeenCalledWith({ token: 'token' });
    expect(fromWebTokenMock).toHaveBeenCalledWith({
      roleArn: 'roleArn',
      webIdentityToken: 'immutable-token',
    });
  });

  it('does not fall back or call STS on exchange errors', async () => {
    exchangeTokenMock.mockRejectedValue(new Error('Exchange denied'));
    await expect(
      awsCredentialsProvider({
        roleArn: 'roleArn',
        enableProjectIdentity: true,
      })()
    ).rejects.toThrow('Exchange denied');
    expect(fromWebTokenMock).not.toHaveBeenCalled();
  });
});
