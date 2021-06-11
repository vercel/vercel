import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectEnvTarget, Project, ProjectEnvType } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import addEnvRecord from '../../util/env/add-env-record';
import getEnvRecords from '../../util/env/get-env-records';
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

type Options = {
  '--debug': boolean;
};

export default async function add(
  client: Client,
  project: Project,
  opts: Partial<Options>,
  args: string[],
  output: Output
) {
  // improve the way we show inquirer prompts
  require('../../util/input/patch-inquirer');

  const stdInput = await readStandardInput();
  let [envName, envTargetArg, envGitBranch] = args;

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: ProjectEnvTarget[] = [];
  if (envTargetArg) {
    if (!isValidEnvTarget(envTargetArg)) {
      output.error(
        `The Environment ${param(
          envTargetArg
        )} is invalid. It must be one of: ${getEnvTargetPlaceholder()}.`
      );
      return 1;
    }
    envTargets.push(envTargetArg);
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

  const { envs } = await getEnvRecords(output, client, project.id);
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

  if (
    !stdInput &&
    !envGitBranch &&
    envTargets.length === 1 &&
    envTargets[0] === ProjectEnvTarget.Preview
  ) {
    const { inputValue } = await inquirer.prompt({
      type: 'input',
      name: 'inputValue',
      message: `Add ${envName} to which Git branch? (leave empty for all Preview branches)?`,
    });
    envGitBranch = inputValue || '';
  }

  const addStamp = stamp();
  try {
    await withSpinner('Saving', () =>
      addEnvRecord(
        output,
        client,
        project.id,
        ProjectEnvType.Encrypted,
        envName,
        envValue,
        envTargets,
        envGitBranch
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
