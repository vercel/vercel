import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectEnvTarget, Project, ProjectEnvVariableV5 } from '../../types';
import { Output } from '../../util/output';
import confirm from '../../util/input/confirm';
import removeEnvRecord from '../../util/env/remove-env-record';
import getEnvVariables from '../../util/env/get-env-records';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
  getEnvTargetChoices,
} from '../../util/env/env-target';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import withSpinner from '../../util/with-spinner';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import { getCommandName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
  '--yes': boolean;
};

export default async function rm(
  client: Client,
  project: Project,
  opts: Options,
  args: string[],
  output: Output
) {
  // improve the way we show inquirer prompts
  require('../../util/input/patch-inquirer');

  if (args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env rm <name> ${getEnvTargetPlaceholder()}`
      )}`
    );
    return 1;
  }

  let [envName, envTarget] = args;
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

    if (!inputName) {
      output.error(`Name cannot be empty`);
      continue;
    }

    envName = inputName;
  }

  const data = await getEnvVariables(output, client, project.id);

  // we expand env vars with multiple targets
  const envs: ProjectEnvVariableV5[] = [];
  for (let env of data.envs) {
    if (Array.isArray(env.target)) {
      for (let target of env.target) {
        envs.push({ ...env, target });
      }
    } else {
      envs.push({ ...env, target: env.target });
    }
  }

  const existing = new Set(
    envs.filter(r => r.key === envName).map(r => r.target)
  );

  if (existing.size === 0) {
    output.error(`The Environment Variable ${param(envName)} was not found.\n`);
    return 1;
  }

  while (envTargets.length === 0) {
    const choices = getEnvTargetChoices().filter(c => existing.has(c.value));
    if (choices.length === 0) {
      output.error(
        `The Environment Variable ${param(
          envName
        )} was found but it is not assigned to any Environments.\n`
      );
      return 1;
    } else if (choices.length === 1) {
      envTargets = [choices[0].value];
    } else {
      const { inputTargets } = await inquirer.prompt({
        name: 'inputTargets',
        type: 'checkbox',
        message: `Remove ${envName} from which Environments (select multiple)?`,
        choices,
      });

      if (inputTargets.length === 0) {
        output.error(
          'Please select an Environment to remove the Environment Variable from.'
        );
      }

      envTargets = inputTargets;
    }
  }

  const skipConfirmation = opts['--yes'];
  if (
    !skipConfirmation &&
    !(await confirm(
      `Removing Environment Variable ${param(
        envName
      )} from Project ${chalk.bold(project.name)}. Are you sure?`,
      false
    ))
  ) {
    output.log('Aborted');
    return 0;
  }

  const rmStamp = stamp();

  try {
    await withSpinner('Removing', async () => {
      for (const target of envTargets) {
        await removeEnvRecord(output, client, project.id, envName, target);
      }
    });
  } catch (error) {
    if (isKnownError(error) && error.serverMessage) {
      output.error(error.serverMessage);
      return 1;
    }
    throw error;
  }

  output.print(
    `${prependEmoji(
      `Removed Environment Variable ${chalk.gray(rmStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
