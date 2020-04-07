import chalk from 'chalk';
import inquirer from 'inquirer';
import { NowContext, ProjectEnvTarget } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import { getLinkedProject } from '../../util/projects/link';
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

type Options = {
  '--debug': boolean;
};

export default async function add(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  const link = await getLinkedProject(output, client);

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.print(
      `${chalk.red(
        'Error!'
      )} Your codebase isn’t linked to a project on ZEIT Now. Run ${cmd(
        'now'
      )} to link it.\n`
    );
    return 1;
  } else {
    const { project } = link;
    let envValue = await readStandardInput();
    let [envName, envTarget] = args;

    if (args.length > 2) {
      output.error(
        `Invalid number of arguments. Usage: ${cmd(
          `now env add <name> ${getEnvTargetPlaceholder()}`
        )}`
      );
      return 1;
    }

    if (envValue && (!envName || !envTarget)) {
      output.error(
        `Invalid number of arguments. Usage: ${cmd(
          `cat <file> | now env add <name> ${getEnvTargetPlaceholder()}`
        )}`
      );
      return 1;
    }

    let envTargets: ProjectEnvTarget[] = [];
    if (envTarget) {
      if (!isValidEnvTarget(envTarget)) {
        output.error(
          `The environment ${param(
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

    const envs = await getEnvVariables(output, client, project.id);
    const existing = new Set(
      envs.filter(r => r.key === envName).map(r => r.target)
    );
    const choices = getEnvTargetChoices().filter(c => !existing.has(c.value));

    if (choices.length === 0) {
      output.error(
        `The variable ${param(
          envName
        )} has already been added to all environments. To remove, run ${cmd(
          `now env rm ${envName}`
        )}.`
      );
      return 1;
    }

    while (!envValue) {
      const { inputValue } = await inquirer.prompt({
        type: 'password',
        name: 'inputValue',
        message: `What’s the value of ${envName}?`,
      });

      envValue = inputValue;

      if (!inputValue) {
        output.error('Value cannot be empty');
      }
    }

    while (envTargets.length === 0) {
      const { inputTargets } = await inquirer.prompt({
        name: 'inputTargets',
        type: 'checkbox',
        message: `Add ${envName} to which environments (select multiple)?`,
        choices,
      });

      envTargets = inputTargets;

      if (inputTargets.length === 0) {
        output.error('Please select at least one environment');
      }
    }

    const addStamp = stamp();
    await withSpinner('Saving', () =>
      addEnvRecord(output, client, project.id, envName, envValue, envTargets)
    );

    output.print(
      `${prependEmoji(
        `Added environment variable ${chalk.bold(
          envName
        )} to project ${chalk.bold(project.name)} ${chalk.gray(addStamp())}`,
        emoji('success')
      )}\n`
    );

    return 0;
  }
}
