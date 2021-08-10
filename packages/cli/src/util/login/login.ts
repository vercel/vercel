import Client from '../client';
import { InvalidEmail, AccountNotFound } from '../errors-ts';
import { LoginData } from './types';

export default async function login(
  client: Client,
  email: string
): Promise<LoginData> {
  try {
    return await client.fetch<LoginData>(`/registration?mode=login`, {
      method: 'POST',
      body: { email },
    });
  } catch (err) {
    if (err.code === 'not_exists') {
      throw new AccountNotFound(
        email,
        `Please sign up: https://vercel.com/signup`
      );
    }

    if (err.code === 'invalid_email') {
      throw new InvalidEmail(email, err.message);
    }

    throw new Error(`Unexpected error: ${err.message}`);
  }
}
