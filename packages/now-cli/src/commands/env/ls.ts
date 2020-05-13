import chalk from 'chalk';
import ms from 'ms';
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
import param from '../../util/output/param';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';

type Options = {
  '--debug': boolean;
  '--next'?: number;
};

export default async function ls(
  client: Client,
  project: Project,
  opts: Options,
  args: string[],
  output: Output
) {
  const { '--next': nextTimestamp } = opts;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env ls ${getEnvTargetPlaceholder()}`
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

  if (typeof nextTimestamp !== 'undefined' && Number.isNaN(nextTimestamp)) {
    output.error('Please provide a number for flag --next');
    return 1;
  }

  const data = await getEnvVariables(
    output,
    client,
    project.id,
    5,
    envTarget,
    nextTimestamp
  );
  const { envs: records, pagination } = data;
  output.log(
    `${
      records.length > 0 ? 'Environment Variables' : 'No Environment Variables'
    } found in Project ${chalk.bold(project.name)} ${chalk.gray(lsStamp())}`
  );
  console.log(getTable(records));

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(opts, ['_', '--next']);
    output.log(
      `To display the next page run ${getCommandName(
        `env ls${flags} --next ${pagination.next}`
      )}`
    );
  }

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
