import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import { Output } from '../../util/output';
import { ProjectEnvVariable, ProjectEnvTarget, Project } from '../../types';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import getEnvVariables from '../../util/env/get-env-records';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
} from '../../util/env/env-target';
import stamp from '../../util/output/stamp';
import cmd from '../../util/output/cmd';
import param from '../../util/output/param';

type Options = {
  '--debug': boolean;
};

export default async function ls(
  client: Client,
  project: Project,
  opts: Options,
  args: string[],
  output: Output
) {
  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${cmd(
        `now env ls ${getEnvTargetPlaceholder()}`
      )}`
    );
    return 1;
  }

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

  const records = await getEnvVariables(output, client, project.id, envTarget);
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
