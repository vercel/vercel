import { errorToString } from '@vercel/error-utils';
import Client from '../client';
import { InvalidEmail, isAPIError } from '../errors-ts';
import { SignUpData } from './types';
export default async function signUp(
  client: Client,
  email: string
): Promise<SignUpData> {
  let result: SignUpData = {};
  try {
    result = await client.fetch<SignUpData>(
      `/registration?mode=signup&source=cli`,
      {
        method: 'POST',
        body: { email, tokenName: 'cli' },
      }
    );
    return result;
  } catch (err: any) {
    if (isAPIError(err)) {
      if (err.code === 'already_exists') {
        throw new InvalidEmail(email, err.message);
      }
    }
    const errorStr = errorToString(err);
    if (errorStr.includes('SMS')) {
      result.error = {
        code: 'SMS',
        message: errorStr,
        email,
      };
      return result;
    }
    throw new Error(`Unexpected error: ${errorToString(err)}`);
  }
}
