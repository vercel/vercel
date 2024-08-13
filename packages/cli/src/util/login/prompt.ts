import Client from '../client';
import error from '../output/error';
import listInput from '../input/list';
import { getCommandName } from '../pkg-name';
import { LoginResult, SAMLError } from './types';
import doSamlLogin from './saml';
import doEmailLogin, { doEmailSignUp } from './email';
import doGithubLogin from './github';
import doGitlabLogin from './gitlab';
import doBitbucketLogin from './bitbucket';
import { verifyPhone, verifyPhoneCode } from './verify';
import sleep from '../sleep';

export default async function prompt(
  client: Client,
  error?: Pick<SAMLError, 'teamId'>,
  outOfBand?: boolean,
  ssoUserId?: string
) {
  let result: LoginResult = 1;

  const choices = [
    { name: 'Continue with GitHub', value: 'github', short: 'github' },
    { name: 'Continue with GitLab', value: 'gitlab', short: 'gitlab' },
    { name: 'Continue with Bitbucket', value: 'bitbucket', short: 'bitbucket' },
    { name: 'Continue with Email', value: 'email', short: 'email' },
    { name: 'Continue with SAML Single Sign-On', value: 'saml', short: 'saml' },
    {
      name: 'Create your Vercel account with Email',
      value: 'emailSignUp',
      short: 'emailSignUp',
    },
  ];

  if (ssoUserId || (error && !error.teamId)) {
    // Remove SAML login option if we're connecting SAML Profile,
    // or if this is a SAML error for a user / team without SAML
    choices.pop();
  }

  const choice = await listInput(client, {
    message: 'Log in to Vercel',
    choices,
  });

  if (choice === 'github') {
    result = await doGithubLogin(client, outOfBand, ssoUserId);
  } else if (choice === 'gitlab') {
    result = await doGitlabLogin(client, outOfBand, ssoUserId);
  } else if (choice === 'bitbucket') {
    result = await doBitbucketLogin(client, outOfBand, ssoUserId);
  } else if (choice === 'email') {
    const email = await readInput(client, 'Enter your email address:');
    result = await doEmailLogin(client, email, ssoUserId);

    // If the the account need phone validation
    if (result === 22) await processPhoneVerification(email);
  } else if (choice === 'emailSignUp') {
    const plans = [{ name: 'Hobby', value: 'hobby', short: 'hobby' }];
    const plan = await listInput(client, {
      message: 'What plan you would like?',
      choices: plans,
    });

    const email = await readInput(client, 'Enter your email address:');
    const slug = error?.teamId || (await readInput(client, 'Enter your name:'));
    result = await doEmailSignUp(client, email, plan, slug, ssoUserId);
  } else if (choice === 'saml') {
    const slug =
      error?.teamId || (await readInput(client, 'Enter your Team slug:'));
    result = await doSamlLogin(client, slug, outOfBand, ssoUserId);
  }

  return result;

  async function processPhoneVerification(email: string) {
    const phoneNum = await readInput(
      client,
      'SMS verification, enter your phone number:'
    );
    const countryCode = await readInput(
      client,
      'Enter your country code (e.g USA => us):'
    );

    await verifyPhone(client, email, phoneNum, countryCode);
    await sleep(3000);
    const code = await readInput(
      client,
      `A code has been sent to ${phoneNum}, Enter it:`
    );
    await verifyPhoneCode(client, email, phoneNum, countryCode, code);

    result = await doEmailLogin(client, email, ssoUserId);
  }
}

export async function readInput(
  client: Client,
  message: string
): Promise<string> {
  let input;

  while (!input) {
    try {
      input = await client.input.text({ message });
    } catch (err: any) {
      client.output.print('\n'); // \n

      if (err.isTtyError) {
        throw new Error(
          error(
            `Interactive mode not supported – please run ${getCommandName(
              `login you@domain.com`
            )}`
          )
        );
      }
    }
  }

  return input;
}
