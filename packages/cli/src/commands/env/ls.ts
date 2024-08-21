import chalk from 'chalk';
import ms from 'ms';
import title from 'title';
import { Output } from '../../util/output';
import type {
  CustomEnvironment,
  Project,
  ProjectEnvVariable,
} from '@vercel-internals/types';
import Client from '../../util/client';
import formatTable from '../../util/format-table';
import getEnvRecords from '../../util/env/get-env-records';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import ellipsis from '../../util/output/ellipsis';
import { isObject } from '@vercel/error-utils';

type Options = {};

export default async function ls(
  client: Client,
  project: Project,
  opts: Partial<Options>,
  args: string[],
  output: Output
) {
  if (args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env ls ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  const [envTarget, envGitBranch] = args;

  const lsStamp = stamp();

  const [envsResult, customEnvs] = await Promise.all([
    getEnvRecords(output, client, project.id, 'vercel-cli:env:ls', {
      target: envTarget,
      gitBranch: envGitBranch,
    }),
    getCustomEnvironments(client, project.id),
  ]);
  const { envs } = envsResult;

  if (envs.length === 0) {
    output.log(
      `No Environment Variables found in Project ${chalk.bold(
        project.name
      )} ${chalk.gray(lsStamp())}`
    );
  } else {
    output.log(
      `Environment Variables found in Project ${chalk.bold(
        project.name
      )} ${chalk.gray(lsStamp())}`
    );
    client.stdout.write(`${getTable(envs, customEnvs)}\n`);
  }

  return 0;
}

async function getCustomEnvironments(client: Client, projectId: string) {
  try {
    const res = await client.fetch<{ environments: CustomEnvironment[] }>(
      `/projects/${encodeURIComponent(projectId)}/custom-environments`,
      { method: 'GET' }
    );
    return res.environments;
  } catch (error) {
    if (isObject(error) && error.status === 404) {
      // user is not flagged for custom environments
      return [];
    }
    throw error;
  }
}

function getTable(
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
        rows: records.map(row => getRow(row, customEnvironments)),
      },
    ]
  );
}

function getRow(
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
    formatEnvTarget(env, customEnvironments),
    env.createdAt ? `${ms(now - env.createdAt)} ago` : '',
  ];
}

function formatEnvTarget(
  env: ProjectEnvVariable,
  customEnvironments: CustomEnvironment[]
) {
  const defaultTargets = (
    Array.isArray(env.target) ? env.target : [env.target || '']
  ).map(t => title(t));
  const customTargets = env.customEnvironmentIds
    ? env.customEnvironmentIds
        .map(id => customEnvironments.find(e => e.id === id)?.name)
        .filter(Boolean)
    : [];
  const targetsString = [...defaultTargets, ...customTargets].join(', ');
  return env.gitBranch ? `${targetsString} (${env.gitBranch})` : targetsString;
}
