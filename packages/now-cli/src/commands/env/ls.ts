import chalk from 'chalk';
import ms from 'ms';
import { Output } from '../../util/output';
import {
  ProjectEnvTarget,
  Project,
  ProjectEnvVariable,
  ProjectEnvType,
} from '../../types';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import getEnvVariables from '../../util/env/get-env-records';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
} from '../../util/env/env-target';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
import ellipsis from '../../util/output/ellipsis';
// @ts-ignore
import title from 'title';

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

  const { envs } = await getEnvVariables(output, client, project.id, envTarget);

  output.log(
    `${
      envs.length > 0 ? 'Environment Variables' : 'No Environment Variables'
    } found in Project ${chalk.bold(project.name)} ${chalk.gray(lsStamp())}`
  );
  console.log(getTable(envs));

  return 0;
}

function getTable(records: ProjectEnvVariable[]) {
  return formatTable(
    ['name', 'value', 'environments', 'created'],
    ['l', 'l', 'l', 'l', 'l'],
    [
      {
        name: '',
        rows: records.map(getRow),
      },
    ]
  );
}

function getRow(env: ProjectEnvVariable) {
  let value: string;
  if (env.type === ProjectEnvType.Plaintext) {
    // replace space characters (line-break, etc.) with simple spaces
    // to make sure the displayed value is a single line
    const singleLineValue = env.value.replace(/\s/g, ' ');

    value = chalk.gray(ellipsis(singleLineValue, 19));
  } else if (env.type === ProjectEnvType.System) {
    value = chalk.gray.italic(env.value);
  } else {
    value = chalk.gray.italic('Encrypted');
  }

  const now = Date.now();
  return [
    chalk.bold(env.key),
    value,
    (Array.isArray(env.target) ? env.target : [env.target || ''])
      .map(title)
      .join(', '),
    env.createdAt ? `${ms(now - env.createdAt)} ago` : '',
  ];
}
