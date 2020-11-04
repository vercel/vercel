import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectEnvTarget, Project, Secret } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import addEnvRecord from '../../util/env/add-env-record';
import getEnvVariables from '../../util/env/get-env-records';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
  getEnvTargetChoices,
} from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import param from '../../util/output/param';
import withSpinner from '../../util/with-spinner';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import { getCommandName } from '../../util/pkg-name';
import code from '../../util/output/code';

type Options = {
  '--debug': boolean;
};

export default async function add(
  client: Client,
  project: Project,
  opts: Options,
  args: string[],
  output: Output
) {
  const stdInput = await readStandardInput();
  let [envName, envTarget] = args;

  if (args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> ${getEnvTargetPlaceholder()}`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTarget)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: ProjectEnvTarget[] = [];
  if (envTarget) {
    if (!isValidEnvTarget(envTarget)) {
      output.error(
        `The Environment ${param(
          envTarget
        )} is invalid. It must be one of: ${getEnvTargetPlaceholder()}.`
      );
      return 1;
    }
    envTargets.push(envTarget);
  }

  const { envType } = (await inquirer.prompt({
    name: 'envType',
    type: 'list',
    message: `Which type of Environment Variable do you want to add?`,
    choices: [
      { name: 'Plaintext', value: 'plain' },
      {
        name: `Secret (can be created using ${code('vercel secret add')})`,
        value: 'secret',
      },
      { name: 'Provided by System', value: 'system' },
    ],
  })) as { envType: 'plain' | 'secret' | 'system' };

  while (!envName) {
    const { inputName } = await inquirer.prompt({
      type: 'input',
      name: 'inputName',
      message: `What’s the name of the variable?`,
    });

    envName = inputName;

    if (!inputName) {
      output.error('Name cannot be empty');
    }
  }

  const { envs } = await getEnvVariables(output, client, project.id);
  const existing = new Set(
    envs.filter(r => r.key === envName).map(r => r.target)
  );
  const choices = getEnvTargetChoices().filter(c => !existing.has(c.value));

  if (choices.length === 0) {
    output.error(
      `The variable ${param(
        envName
      )} has already been added to all Environments. To remove, run ${getCommandName(
        `env rm ${envName}`
      )}.`
    );
    return 1;
  }

  let envValue: string;

  if (envType === 'plain') {
    if (stdInput) {
      envValue = stdInput;
    } else {
      const { inputValue } = await inquirer.prompt({
        type: 'input',
        name: 'inputValue',
        message: `What’s the value of ${envName}?`,
      });

      envValue = inputValue || '';
    }
  } else if (envType === 'secret') {
    let secretId: string | null = null;

    while (!secretId) {
      let { secretName } = await inquirer.prompt({
        type: 'input',
        name: 'secretName',
        message: `What’s the value of ${envName}?`,
      });

      secretName = secretName || '';

      if (secretName[0] === '@') {
        secretName = secretName.slice(1);
      }

      try {
        const secret = await client.fetch<Secret>(
          `/v2/now/secrets/${encodeURIComponent(secretName)}`
        );

        secretId = secret.uid;
      } catch (error) {
        if (error.status === 404) {
          output.error(
            `Please enter the name of an existing Secret (can be created with ${code(
              'vercel secret add'
            )}).`
          );
        } else {
          throw error;
        }
      }
    }

    envValue = secretId;
  } else {
    const SYSTEM_ENV_VARIABLES = [
      'VERCEL_URL',
      'VERCEL_GITHUB_COMMIT_ORG',
      'VERCEL_GITHUB_COMMIT_REF',
      'VERCEL_GITHUB_ORG',
      'VERCEL_GITHUB_DEPLOYMENT',
      'VERCEL_GITHUB_COMMIT_REPO',
      'VERCEL_GITHUB_REPO',
      'VERCEL_GITHUB_COMMIT_AUTHOR_LOGIN',
      'VERCEL_GITHUB_COMMIT_AUTHOR_NAME',
      'VERCEL_GITHUB_COMMIT_SHA',
      'VERCEL_GITLAB_DEPLOYMENT',
      'VERCEL_GITLAB_PROJECT_NAMESPACE',
      'VERCEL_GITLAB_PROJECT_NAME',
      'VERCEL_GITLAB_PROJECT_ID',
      'VERCEL_GITLAB_PROJECT_PATH',
      'VERCEL_GITLAB_COMMIT_REF',
      'VERCEL_GITLAB_COMMIT_SHA',
      'VERCEL_GITLAB_COMMIT_MESSAGE',
      'VERCEL_GITLAB_COMMIT_AUTHOR_LOGIN',
      'VERCEL_GITLAB_COMMIT_AUTHOR_NAME',
      'VERCEL_BITBUCKET_DEPLOYMENT',
      'VERCEL_BITBUCKET_REPO_OWNER',
      'VERCEL_BITBUCKET_REPO_SLUG',
      'VERCEL_BITBUCKET_REPO_NAME',
      'VERCEL_BITBUCKET_COMMIT_REF',
      'VERCEL_BITBUCKET_COMMIT_SHA',
      'VERCEL_BITBUCKET_COMMIT_MESSAGE',
      'VERCEL_BITBUCKET_COMMIT_AUTHOR_NAME',
      'VERCEL_BITBUCKET_COMMIT_AUTHOR_URL',
      'VERCEL_BITBUCKET_COMMIT_AUTHOR_AVATAR',
    ];

    const { systemEnvValue } = await inquirer.prompt({
      name: 'systemEnvValue',
      type: 'list',
      message: `Which type of Environment Variable do you want to add?`,
      choices: SYSTEM_ENV_VARIABLES.map(value => ({ name: value, value })),
    });

    envValue = systemEnvValue;
  }

  while (envTargets.length === 0) {
    const { inputTargets } = await inquirer.prompt({
      name: 'inputTargets',
      type: 'checkbox',
      message: `Add ${envName} to which Environments (select multiple)?`,
      choices,
    });

    envTargets = inputTargets;

    if (inputTargets.length === 0) {
      output.error('Please select at least one Environment');
    }
  }

  const addStamp = stamp();
  try {
    await withSpinner('Saving', () =>
      addEnvRecord(
        output,
        client,
        project.id,
        envType,
        envName,
        envValue,
        envTargets
      )
    );
  } catch (error) {
    if (isKnownError(error) && error.serverMessage) {
      output.error(error.serverMessage);
      return 1;
    }
    throw error;
  }

  output.print(
    `${prependEmoji(
      `Added Environment Variable ${chalk.bold(
        envName
      )} to Project ${chalk.bold(project.name)} ${chalk.gray(addStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
