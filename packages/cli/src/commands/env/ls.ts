import { determineAgent } from '@vercel/detect-agent';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
  ProjectLinked,
} from '@vercel-internals/types';
import chalk from 'chalk';
import ms from 'ms';
import output from '../../output-manager';
import type Client from '../../util/client';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import formatEnvironments from '../../util/env/format-environments';
import getEnvRecords from '../../util/env/get-env-records';
import { printError } from '../../util/error';
import formatTable from '../../util/format-table';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import ellipsis from '../../util/output/ellipsis';
import stamp from '../../util/output/stamp';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import { formatProject } from '../../util/projects/format-project';
import { getLinkedProject } from '../../util/projects/link';
import { suggestNextCommands } from '../../util/suggest-next-commands';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import { EnvLsTelemetryClient } from '../../util/telemetry/commands/env/ls';
import { validateLsArgs } from '../../util/validate-ls-args';
import { listSubcommand } from './command';

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

  const validationResult = validateLsArgs({
    commandName: 'env ls',
    args: args,
    maxArgs: 2,
    exitCode: 1,
    usageString: getCommandName(
      `env ls ${getEnvTargetPlaceholder()} <gitbranch>`
    ),
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  const [envTarget, envGitBranch] = args;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetryClient.trackCliArgumentEnvironment(envTarget);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliFlagGuidance(flags['--guidance']);
  telemetryClient.trackCliOptionFormat(flags['--format']);

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

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      envs: envs.map(env => ({
        key: env.key,
        value: env.type === 'plain' ? env.value : undefined,
        type: env.type,
        target: env.target,
        gitBranch: env.gitBranch,
        configurationId: env.configurationId,
        createdAt: env.createdAt,
        updatedAt: env.updatedAt,
      })),
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (envs.length === 0) {
    output.log(
      `No Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
  } else {
    output.log(
      `Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
    client.stdout.write(`${getTable(link, envs, customEnvs)}\n`);
  }

  if (!asJson) {
    const { isAgent } = await determineAgent();
    const guidanceMode = parsedArgs.flags['--guidance'] ?? isAgent;
    if (guidanceMode) {
      suggestNextCommands([
        getCommandName(`env add`),
        getCommandName('env rm'),
        getCommandName(`env pull`),
      ]);
    }
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
