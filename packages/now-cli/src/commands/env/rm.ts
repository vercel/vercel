import chalk from 'chalk';
import inquirer from 'inquirer';
import { NowContext, ProjectEnvTarget } from '../../types';
import { Output } from '../../util/output';
import promptBool from '../../util/prompt-bool';
import { getLinkedProject } from '../../util/projects/link';
import removeEnvRecord from '../../util/env/remove-env-record';
import getEnvVariables from '../../util/env/get-env-records';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
  getEnvTargetChoices,
} from '../../util/env/env-target';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import cmd from '../../util/output/cmd';
import param from '../../util/output/param';
import withSpinner from '../../util/with-spinner';
import { emoji, prependEmoji } from '../../util/emoji';

type Options = {
  '--debug': boolean;
  '--yes': boolean;
};

export default async function rm(
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
    if (args.length > 2) {
      output.error(
        `Invalid number of arguments. Usage: ${cmd(
          `now env rm <name> ${getEnvTargetPlaceholder()}`
        )}`
      );
      return 1;
    }

    const { project } = link;
    let [envName, envTarget] = args;
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

      if (!inputName) {
        output.error(`Name cannot be empty`);
        continue;
      }

      envName = inputName;
    }

    const envs = await getEnvVariables(output, client, project.id);
    const existing = new Set(
      envs.filter(r => r.key === envName).map(r => r.target)
    );

    if (existing.size === 0) {
      output.error(
        `The environment variable ${param(envName)} was not found.\n`
      );
      return 1;
    }

    if (envTargets.length === 0) {
      const choices = getEnvTargetChoices().filter(c => existing.has(c.value));
      if (choices.length === 0) {
        output.error(
          `The environment variable ${param(
            envName
          )} was found but it is not assign to any environments.\n`
        );
        return 1;
      } else if (choices.length === 1) {
        envTargets = [choices[0].value];
      } else {
        const { inputTargets } = await inquirer.prompt({
          name: 'inputTargets',
          type: 'checkbox',
          message: `Remove ${envName} from which environments (select multiple)?`,
          choices,
        });
        envTargets = inputTargets;
      }
    }

    const skipConfirmation = opts['--yes'];
    if (
      !skipConfirmation &&
      !(await promptBool(
        output,
        `Remove environment variable ${param(
          envName
        )} from project ${chalk.bold(project.name)}. Are you sure?`
      ))
    ) {
      output.log('Aborted');
      return 0;
    }

    const rmStamp = stamp();

    await withSpinner('Removing', async () => {
      for (const target of envTargets) {
        await removeEnvRecord(output, client, project.id, envName, target);
      }
    });

    output.print(
      `${prependEmoji(
        `Removed environment variable ${chalk.gray(rmStamp())}`,
        emoji('success')
      )}\n`
    );

    return 0;
  }
}
