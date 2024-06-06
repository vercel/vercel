import { expect, it, vi } from 'vitest';
import { awsCredentialsProvider } from '../src';

const getVercelOidcTokenMock = vi.fn().mockReturnValue('token');
vi.mock('../src/getVercelOidcToken', () => {
  return {
    getVercelOidcToken: () => getVercelOidcTokenMock(),
  };
});

const fromWebTokenExectionMock = vi.fn();
const fromWebTokenMock = vi.fn().mockReturnValue(fromWebTokenExectionMock);
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
    webIdentityToken: getVercelOidcTokenMock(),
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
