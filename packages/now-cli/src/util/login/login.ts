import fetch from 'node-fetch';
import { hostname } from 'os';
import { InvalidEmail, AccountNotFound } from '../errors-ts';
import ua from '../ua';

type LoginData = {
  token: string,
  securityCode: string
}

export default async function login(
  apiUrl: string,
  email: string,
  mode: 'login' | 'signup' = 'login'
): Promise<LoginData | InvalidEmail | AccountNotFound> {
  const hyphens = new RegExp('-', 'g');
  const host = hostname().replace(hyphens, ' ').replace('.local', '');
  const tokenName = `Now CLI on ${host}`;

  const response = await fetch(`${apiUrl}/now/registration?mode=${mode}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ua,
    },
    body: JSON.stringify({
      tokenName,
      email,
    })
  });

  const body = await response.json();
  if (!response.ok) {
    const { error = {} } = body;
    if (error.code === 'not_exists') {
      throw new AccountNotFound(email, `Please sign up: https://zeit.co/signup`)
    }

    if (error.code === 'invalid_email') {
      throw new InvalidEmail(email, error.message);
    }

    throw new Error(`Unexpected error: ${error.message}`)
  }

  return body as LoginData;
}
