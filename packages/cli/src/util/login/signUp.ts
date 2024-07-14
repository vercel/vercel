import { errorToString } from '@vercel/error-utils';
import Client from '../client';
import { InvalidEmail, isAPIError } from '../errors-ts';
import { SignUpData } from './types';

export default async function signUp(
  client: Client,
  email: string
): Promise<SignUpData> {
  try {
    return await client.fetch<SignUpData>(
      `/registration?mode=signup&source=cli`,
      {
        method: 'POST',
        body: { email, tokenName: 'other' },
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.code === 'invalid_email') {
        throw new InvalidEmail(email, err.message);
      }
    }

    throw new Error(`Unexpected error: ${errorToString(err)}`);
  }
}
