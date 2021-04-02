import ms from 'ms';
import { stringify as stringifyQuery } from 'querystring';
import fetch from 'node-fetch';
import sleep from '../sleep';
import ua from '../ua';
import error from '../output/error';
import highlight from '../output/highlight';
import eraseLines from '../output/erase-lines';
import executeLogin from './login';
import { LoginParams } from './types';

async function verify(
  email: string,
  verificationToken: string,
  { apiUrl, output }: LoginParams
): Promise<string> {
  const query = {
    email,
    token: verificationToken,
  };

  output.debug('GET /now/registration/verify');

  let res;

  try {
    res = await fetch(
      `${apiUrl}/now/registration/verify?${stringifyQuery(query)}`,
      {
        headers: { 'User-Agent': ua },
      }
    );
  } catch (err) {
    output.debug(`error fetching /now/registration/verify: ${err.stack}`);

    throw new Error(
      error(
        `An unexpected error occurred while trying to verify your login: ${err.message}`
      )
    );
  }

  output.debug('parsing response from GET /now/registration/verify');
  let body;

  try {
    body = await res.json();
  } catch (err) {
    output.debug(
      `error parsing the response from /now/registration/verify: ${err.stack}`
    );
    throw new Error(
      error(
        `An unexpected error occurred while trying to verify your login: ${err.message}`
      )
    );
  }

  return body.token;
}

export default async function doEmailLogin(
  email: string,
  { apiUrl, output }: LoginParams
): Promise<number | string> {
  let securityCode;
  let verificationToken;

  output.spinner('Sending you an email');

  try {
    const data = await executeLogin(apiUrl, email);
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
      token = await verify(email, verificationToken, { apiUrl, output });
    } catch (err) {
      if (/invalid json response body/.test(err.message)) {
        // /now/registraton is currently returning plain text in that case
        // we just wait for the user to click on the link
      } else {
        output.error(err.message);
        return 1;
      }
    }
  }

  output.success('Email confirmed');
  return token;
}
