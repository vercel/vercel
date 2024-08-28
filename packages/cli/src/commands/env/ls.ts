import chalk from 'chalk';
import ms from 'ms';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
  ProjectLinked,
} from '@vercel-internals/types';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import getEnvRecords from '../../util/env/get-env-records';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import ellipsis from '../../util/output/ellipsis';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import formatEnvironments from '../../util/env/format-environments';
import { formatProject } from '../../util/projects/format-project';

type Options = {};

export default async function ls(
  client: Client,
  link: ProjectLinked,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;

  if (args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env ls ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  const [envTarget, envGitBranch] = args;
  const { project, org } = link;

  const lsStamp = stamp();

  const [envsResult, customEnvs] = await Promise.all([
    getEnvRecords(client, project.id, 'vercel-cli:env:ls', {
      target: envTarget,
      gitBranch: envGitBranch,
    }),
    getCustomEnvironments(client, project.id),
  ]);
  const { envs } = envsResult;

  const projectSlugLink = formatProject(client, org.slug, project.name);

  if (envs.length === 0) {
    output.log(
      `No Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
  } else {
    output.log(
      `Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
    client.stdout.write(`${getTable(client, link, envs, customEnvs)}\n`);
  }

  return 0;
}

function getTable(
  client: Client,
  link: ProjectLinked,
  records: ProjectEnvVariable[],
  customEnvironments: CustomEnvironment[]
) {
  const label = records.some(env => env.gitBranch)
    ? 'environments (git branch)'
    : 'environments';
  return formatTable(
    ['name', 'value', label, 'created'],
    ['l', 'l', 'l', 'l', 'l'],
    [
      {
        name: '',
        rows: records.map(row => getRow(client, link, row, customEnvironments)),
      },
    ]
  );
}

function getRow(
  client: Client,
  link: ProjectLinked,
  env: ProjectEnvVariable,
  customEnvironments: CustomEnvironment[]
) {
  let value: string;
  if (env.type === 'plain') {
    // replace space characters (line-break, etc.) with simple spaces
    // to make sure the displayed value is a single line
    const singleLineValue = env.value.replace(/\s/g, ' ');

    value = chalk.gray(ellipsis(singleLineValue, 19));
  } else if (env.type === 'system') {
    value = chalk.gray.italic(env.value);
  } else {
    value = chalk.gray.italic('Encrypted');
  }

  const now = Date.now();
  return [
    chalk.bold(env.key),
    value,
    formatEnvironments(client, link, env, customEnvironments),
    env.createdAt ? `${ms(now - env.createdAt)} ago` : '',
  ];
}
