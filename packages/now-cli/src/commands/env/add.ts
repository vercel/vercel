import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectEnvTarget, Project } from '../../types';
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
import cmd from '../../util/output/cmd';
import param from '../../util/output/param';
import withSpinner from '../../util/with-spinner';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';

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
      `Invalid number of arguments. Usage: ${cmd(
        `now env add <name> ${getEnvTargetPlaceholder()}`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTarget)) {
    output.error(
      `Invalid number of arguments. Usage: ${cmd(
        `now env add <name> <target> < <file>`
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

  const envs = await getEnvVariables(output, client, project.id, 4);
  const existing = new Set(
    envs.filter(r => r.key === envName).map(r => r.target)
  );
  const choices = getEnvTargetChoices().filter(c => !existing.has(c.value));

  if (choices.length === 0) {
    output.error(
      `The variable ${param(
        envName
      )} has already been added to all Environments. To remove, run ${cmd(
        `now env rm ${envName}`
      )}.`
    );
    return 1;
  }

  let envValue: string;

  if (stdInput) {
    envValue = stdInput;
  } else {
    const { inputValue } = await inquirer.prompt({
      type: 'password',
      name: 'inputValue',
      message: `What’s the value of ${envName}?`,
    });
    envValue = inputValue || '';
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
      addEnvRecord(output, client, project.id, envName, envValue, envTargets)
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
