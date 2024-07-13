import { errorToString } from '@vercel/error-utils';
import Client from '../client';
import { AccountNotFound, InvalidEmail, isAPIError } from '../errors-ts';
import { SignUpData } from './types';
// import { clearInterval } from 'timers';

export default async function signUp(
  client: Client,
  email: string
): Promise<SignUpData> {
  try {
    return await client.fetch<SignUpData>(
      `/registration?mode=signUp&source=web`,
      {
        method: 'POST',
        body: { email, tokenName: 'other' },
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.code === 'not_exists') {
        throw new AccountNotFound(
          email,
          `Please sign up: https://vercel.com/signup`
        );
      }

      if (err.code === 'invalid_email') {
        throw new InvalidEmail(email, err.message);
      }
    }

    throw new Error(`Unexpected error: ${errorToString(err)}`);
  }
}
