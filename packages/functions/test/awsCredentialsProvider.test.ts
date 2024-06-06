import { awsCredentialsProvider } from '../src';

const getVercelOidcTokenMock = jest.fn().mockReturnValue('token');
jest.mock('../src/getVercelOidcToken', () => {
  return {
    getVercelOidcToken: () => getVercelOidcTokenMock(),
  };
});

const fromWebTokenExectionMock = jest.fn();
const fromWebTokenMock = jest.fn().mockReturnValue(fromWebTokenExectionMock);
jest.mock('@aws-sdk/credential-provider-web-identity', () => {
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
