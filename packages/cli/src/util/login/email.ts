import ms from 'ms';
import sleep from '../sleep';
import highlight from '../output/highlight';
import eraseLines from '../output/erase-lines';
import verify from './verify';
import executeLogin from './login';
import Client from '../client';

export default async function doEmailLogin(
  client: Client,
  email: string,
  ssoUserId?: string
): Promise<number | string> {
  let securityCode;
  let verificationToken;
  const { output } = client;

  output.spinner('Sending you an email');

  try {
    const data = await executeLogin(client, email);
    verificationToken = data.token;
    securityCode = data.securityCode;
  } catch (err) {
    output.error(err.message);
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

  let token = '';
  while (!token) {
    try {
      await sleep(ms('1s'));
      token = await verify(
        client,
        email,
        verificationToken,
        'Email',
        ssoUserId
      );
    } catch (err) {
      if (err.serverMessage !== 'Confirmation incomplete') {
        output.error(err.message);
        return 1;
      }
    }
  }

  output.success(`Email authentication complete for ${email}`);
  return token;
}
