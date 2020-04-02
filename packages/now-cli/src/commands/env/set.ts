import chalk from 'chalk';
import inquirer from 'inquirer';
import { NowContext, ProjectEnvTarget } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import { getLinkedProject } from '../../util/projects/link';
import addEnvRecord from '../../util/env/add-env-record';
import readStandardInput from '../../util/input/read-standard-input';
import cmd from '../../util/output/cmd';
import withSpinner from '../../util/with-spinner';
import { emoji, prependEmoji } from '../../util/emoji';

type Options = {
  '--debug': boolean;
};

export default async function set(
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
    const { org, project } = link;
    if (args.length > 2) {
      output.error(
        `Invalid number of arguments. See: ${chalk.cyan(
          '`now env --help`'
        )} for usage.`
      );
      return 1;
    }

    let envValue = await readStandardInput();
    const addStamp = stamp();
    let [envName, envTarget] = args;

    let envTargets: ProjectEnvTarget[] = [];
    if (envTarget) {
      if (!isValidEnvTarget(envTarget)) {
        output.error(
          `The environment ${cmd(envTarget)} is not valid.\n` +
            `Please use one of the following: <${validEnvTargets().join(
              ' | '
            )}>.`
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

    while (!envValue) {
      const { inputValue } = await inquirer.prompt({
        type: 'input',
        name: 'inputValue',
        message: `What’s the value of ${envName}?`,
      });

      if (!inputValue) {
        output.error(`Value cannot be empty`);
        continue;
      }

      envValue = inputValue;
    }

    if (envTargets.length === 0) {
      const { inputTargets } = await inquirer.prompt({
        name: 'inputTargets',
        type: 'checkbox',
        message: `Enable ${envName} in which environments (select multiple)?`,
        choices: Object.entries(ProjectEnvTarget).map(([key, value]) => ({
          name: key,
          value: value,
        })),
      });
      envTargets = inputTargets;
    }

    await withSpinner('Saving', async () => {
      for (const target of envTargets) {
        await addEnvRecord(
          output,
          client,
          project.id,
          envName,
          envValue,
          target
        );
      }
    });

    output.print(
      `${prependEmoji(
        `Added ${envTargets.join(' ')} environment variable ${chalk.bold(
          envName
        )} to project ${chalk.bold(project.name)} ${chalk.gray(addStamp())}`,
        emoji('success')
      )}\n`
    );

    output.print(
      `${prependEmoji(
        `Environment variables can be managed here: https://zeit.co/${org.slug}/${project.name}/settings#env`,
        emoji('tip')
      )}\n`
    );

    return 0;
  }
}

function validEnvTargets(): string[] {
  return Object.values(ProjectEnvTarget);
}

function isValidEnvTarget(
  target?: string
): target is ProjectEnvTarget | undefined {
  return typeof target === 'undefined' || validEnvTargets().includes(target);
}
