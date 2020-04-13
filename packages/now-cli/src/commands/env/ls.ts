import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import { Output } from '../../util/output';
import { ProjectEnvVariable, ProjectEnvTarget, NowContext } from '../../types';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import getEnvVariables from '../../util/env/get-env-records';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
} from '../../util/env/env-target';
import { getLinkedProject } from '../../util/projects/link';
import stamp from '../../util/output/stamp';
import cmd from '../../util/output/cmd';
import param from '../../util/output/param';

type Options = {
  '--debug': boolean;
};

export default async function ls(
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
    if (args.length > 1) {
      output.error(
        `Invalid number of arguments. Usage: ${cmd(
          `now env ls ${getEnvTargetPlaceholder()}`
        )}`
      );
      return 1;
    }

    const { project } = link;
    const envTarget = args[0] as ProjectEnvTarget | undefined;

    if (!isValidEnvTarget(envTarget)) {
      output.error(
        `The Environment ${param(
          envTarget
        )} is invalid. It must be one of: ${getEnvTargetPlaceholder()}.`
      );
      return 1;
    }

    const lsStamp = stamp();

    const records = await getEnvVariables(
      output,
      client,
      project.id,
      envTarget
    );
    output.log(
      `${plural(
        'Environment Variable',
        records.length,
        true
      )} found in Project ${chalk.bold(project.name)} ${chalk.gray(lsStamp())}`
    );
    console.log(getTable(records));
    return 0;
  }
}

function getTable(records: ProjectEnvVariable[]) {
  return formatTable(
    ['name', 'value', 'environment', 'created'],
    ['l', 'l', 'l', 'l', 'l'],
    [
      {
        name: '',
        rows: records.map(getRow),
      },
    ]
  );
}

function getRow({
  key,
  system = false,
  target,
  createdAt = 0,
}: ProjectEnvVariable) {
  const now = Date.now();
  return [
    chalk.bold(key),
    chalk.gray(chalk.italic(system ? 'Populated by System' : 'Encrypted')),
    target || '',
    `${ms(now - createdAt)} ago`,
  ];
}
