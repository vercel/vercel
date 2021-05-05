import inquirer from 'inquirer';
import error from '../output/error';
import listInput from '../input/list';
import { getCommandName } from '../pkg-name';
import doSsoLogin from './sso';
import doEmailLogin from './email';
import { LoginParams } from './types';

export default async function prompt(params: LoginParams) {
  let result: number | string = 1;

  const choices = [
    { name: 'Continue with GitHub', value: 'github', short: 'github' },
    { name: 'Continue with GitLab', value: 'gitlab', short: 'gitlab' },
    { name: 'Continue with Bitbucket', value: 'bitbucket', short: 'bitbucket' },
    { name: 'Continue with Email', value: 'email', short: 'email' },
    { name: 'Continue with SAML Single Sign-On', value: 'saml', short: 'saml' },
  ];

  if (params.ssoUserId) {
    // Remove SAML login option if we're connecting SAML Profile
    choices.pop();
  }

  const choice = await listInput({
    message: 'Log in to Vercel',
    separator: false,
    choices,
  });

  if (choice === 'github') {
  } else if (choice === 'gitlab') {
  } else if (choice === 'bitbucket') {
  } else if (choice === 'email') {
    const email = await readInput('Enter your email address');
    result = await doEmailLogin(email, params);
  } else if (choice === 'saml') {
    const slug = await readInput('Enter your Team slug');
    result = await doSsoLogin(slug, params);
  }

  return result;
}

async function readInput(message: string) {
  let input;

  while (!input) {
    try {
      const { val } = await inquirer.prompt({
        type: 'input',
        name: 'val',
        message,
      });
      input = val;
    } catch (err) {
      console.log(); // \n

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
