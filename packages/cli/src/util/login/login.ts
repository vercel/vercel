import fetch from 'node-fetch';
import { InvalidEmail, AccountNotFound } from '../errors-ts';
import ua from '../ua';
import { LoginData } from './types';

export default async function login(
  apiUrl: string,
  email: string,
  mode: 'login' | 'signup' = 'login'
): Promise<LoginData> {
  const response = await fetch(`${apiUrl}/now/registration?mode=${mode}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ua,
    },
    body: JSON.stringify({ email }),
  });

  const body = await response.json();
  if (!response.ok) {
    const { error = {} } = body;
    if (error.code === 'not_exists') {
      throw new AccountNotFound(
        email,
        `Please sign up: https://vercel.com/signup`
      );
    }

    if (error.code === 'invalid_email') {
      throw new InvalidEmail(email, error.message);
    }

    throw new Error(`Unexpected error: ${error.message}`);
  }

  return body as LoginData;
}
