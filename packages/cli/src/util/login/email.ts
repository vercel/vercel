import ms from 'ms';
import sleep from '../sleep.js';
import highlight from '../output/highlight.js';
import eraseLines from '../output/erase-lines.js';
import verify from './verify.js';
import executeLogin from './login.js';
import Client from '../client.js';
import { LoginResult } from './types.js';
import { isAPIError } from '../errors-ts.js';
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
