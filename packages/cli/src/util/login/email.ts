import ms from 'ms';
import sleep from '../sleep';
import highlight from '../output/highlight';
import eraseLines from '../output/erase-lines';
import verify, { verifySignUp } from './verify';
import executeLogin from './login';
import executeSignUp from './signUp';
import Client from '../client';
import { LoginResult } from './types';
import { isAPIError } from '../errors-ts';
import { errorToString } from '@vercel/error-utils';

export default async function doEmailLogin(
  client: Client,
  email: string,
  ssoUserId?: string
): Promise<LoginResult> {
  let securityCode;
  let verificationToken;
  const { output } = client;

  output.spinner('Sending you an email');

  try {
    const data = await executeLogin(client, email);
    verificationToken = data.token;
    securityCode = data.securityCode;
  } catch (err: unknown) {
    output.error(errorToString(err));
    if (errorToString(err).includes('SMS')) return 22;
    return 1;
  }

  // Clear up `Sending email` success message
  output.print(eraseLines(1));

  output.print(
    `We sent an email to ${highlight(
      email
    )}. Please follow the steps provided inside it and make sure the security code matches ${highlight(
      securityCode
    )}.\n`
  );

  output.spinner('Waiting for your confirmation');

  let result;
  while (!result) {
    try {
      await sleep(ms('1s'));
      result = await verify(
        client,
        verificationToken,
        email,
        'Email',
        ssoUserId
      );
    } catch (err: unknown) {
      if (!isAPIError(err) || err.serverMessage !== 'Confirmation incomplete') {
        output.error(errorToString(err));
        return 1;
      }
    }
  }

  output.success(`Email authentication complete for ${email}`);
  return result;
}
export async function doEmailSignUp(
  client: Client,
  email: string,
  plan: string,
  teamName: string,
  ssoUserId?: string
): Promise<LoginResult> {
  let securityCode;
  let verificationToken;
  const { output } = client;

  try {
    const data = await executeSignUp(client, email);
    verificationToken = data.token;
    securityCode = data.securityCode;

    output.spinner('Sending you an email');
  } catch (err: any) {
    output.error(err.code);
    output.error(errorToString(err));
    return 1;
  }

  // Clear up `Sending email` success message
  output.print(eraseLines(1));

  output.print(
    `We sent an email to ${highlight(
      email
    )}. Please follow the steps provided inside it and make sure the security code matches ${highlight(
      securityCode ?? ''
    )}.\n`
  );

  output.spinner('Waiting for your confirmation');

  let result;
  while (!result) {
    try {
      await sleep(ms('1s'));
      result = await verifySignUp(
        client,
        verificationToken ?? '',
        email,
        'Email',
        plan,
        teamName,
        ssoUserId
      );
    } catch (err: any) {
      output.error(err.code);
      if (!isAPIError(err) || err.serverMessage !== 'Confirmation incomplete') {
        output.error(errorToString(err));
        return 1;
      }
    }
  }

  output.success(`Email sign up complete for ${email}`);
  return result;
}
