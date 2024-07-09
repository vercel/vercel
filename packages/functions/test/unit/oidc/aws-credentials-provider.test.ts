import { describe, expect, it, vi } from 'vitest';
import { awsCredentialsProvider } from '../../../src/oidc';

const getVercelOidcTokenMock = vi.fn().mockResolvedValue('token');
const fromWebTokenExectionMock = vi.fn();
const fromWebTokenMock = vi.fn().mockReturnValue(fromWebTokenExectionMock);

describe('awsCredentialsProvider', () => {
  vi.mock('../../../src/oidc/get-vercel-oidc-token', () => {
    return {
      getVercelOidcToken: async () => getVercelOidcTokenMock(),
    };
  });

  vi.mock('@aws-sdk/credential-provider-web-identity', () => {
    return {
      fromWebToken: (...args: any[]) => fromWebTokenMock(...args),
    };
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
      webIdentityToken: await getVercelOidcTokenMock(),
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
});
