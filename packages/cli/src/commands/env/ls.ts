import chalk from 'chalk';
import ms from 'ms';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
  ProjectLinked,
} from '@vercel-internals/types';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import getEnvRecords from '../../util/env/get-env-records';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import ellipsis from '../../util/output/ellipsis';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import formatEnvironments from '../../util/env/format-environments';
import { formatProject } from '../../util/projects/format-project';
import output from '../../output-manager';
import { EnvLsTelemetryClient } from '../../util/telemetry/commands/env/ls';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { determineAgent } from '@vercel/detect-agent';
import { suggestNextCommands } from '../../util/suggest-next-commands';

export default async function ls(client: Client, argv: string[]) {
  const telemetryClient = new EnvLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env ls ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  const [envTarget, envGitBranch] = args;
  telemetryClient.trackCliArgumentEnvironment(envTarget);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliFlagGuidance(flags['--guidance']);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

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

  const projectSlugLink = formatProject(org.slug, project.name);

  if (envs.length === 0) {
    output.log(
      `No Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
  } else {
    output.log(
      `Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
    client.stdout.write(`${getTable(link, envs, customEnvs)}\n`);
  }

  const { isAgent } = await determineAgent();
  const guidanceMode = parsedArgs.flags['--guidance'] ?? isAgent;
  if (guidanceMode) {
    suggestNextCommands([
      getCommandName(`env add`),
      getCommandName('env rm'),
      getCommandName(`env pull`),
    ]);
  }

  return 0;
}

function getTable(
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
        rows: records.map(row => getRow(link, row, customEnvironments)),
      },
    ]
  );
}

function getRow(
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
    formatEnvironments(link, env, customEnvironments),
    env.createdAt ? `${ms(now - env.createdAt)} ago` : '',
  ];
}
