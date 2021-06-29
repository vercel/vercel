import inquirer from 'inquirer';
import Client from '../client';
import error from '../output/error';
import listInput from '../input/list';
import { getCommandName } from '../pkg-name';
import { SAMLError } from './types';
import doSsoLogin from './sso';
import doEmailLogin from './email';
import doGithubLogin from './github';
import doGitlabLogin from './gitlab';
import doBitbucketLogin from './bitbucket';

export default async function prompt(
  client: Client,
  error?: Pick<SAMLError, 'teamId'>
) {
  let result: number | string = 1;

  const choices = [
    { name: 'Continue with GitHub', value: 'github', short: 'github' },
    { name: 'Continue with GitLab', value: 'gitlab', short: 'gitlab' },
    { name: 'Continue with Bitbucket', value: 'bitbucket', short: 'bitbucket' },
    { name: 'Continue with Email', value: 'email', short: 'email' },
    { name: 'Continue with SAML Single Sign-On', value: 'sso', short: 'sso' },
  ];

  if (error && !error.teamId) {
    // Remove SAML login option if this is a SAML
    // error for a user or a team without SAML
    choices.pop();
  }

  const choice = await listInput({
    message: 'Log in to Vercel',
    choices,
  });

  if (choice === 'github') {
    result = await doGithubLogin(client);
  } else if (choice === 'gitlab') {
    result = await doGitlabLogin(client);
  } else if (choice === 'bitbucket') {
    result = await doBitbucketLogin(client);
  } else if (choice === 'email') {
    const email = await readInput('Enter your email address');
    result = await doEmailLogin(client, email);
  } else if (choice === 'sso') {
    const slug = error?.teamId || (await readInput('Enter your Team slug'));
    result = await doSsoLogin(client, slug);
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
