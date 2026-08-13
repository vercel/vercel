import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import getSharedEnvRecords, {
  type SharedEnvVariable,
} from '../../util/env/get-shared-env-records';
import table from '../../util/output/table';
import stamp from '../../util/output/stamp';
import { getPaginationOpts } from '../../util/get-pagination-opts';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { EnvSharedLsTelemetryClient } from '../../util/telemetry/commands/env/shared-ls';
import { sharedListSubcommand } from './command';

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EnvSharedLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sharedListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('env shared ls')}`
      )}`
    );
    return 1;
  }

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  const projectFilter = flags['--project'];
  telemetry.trackCliOptionProject(projectFilter);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let paginationOptions: (number | undefined)[];
  try {
    paginationOptions = getPaginationOpts(flags);
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }
  const [next, limit] = paginationOptions;

  const { contextName } = await getScope(client);

  const lsStamp = stamp();

  output.spinner(
    `Fetching Shared Environment Variables under ${chalk.bold(contextName)}`
  );

  let data;
  try {
    data = await getSharedEnvRecords(client, {
      projectId: projectFilter,
      limit,
      next,
    });
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
  const { data: envs, pagination } = data;

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(`${JSON.stringify(toJson(envs), null, 2)}\n`);
    return 0;
  }

  if (envs.length === 0) {
    output.log(
      `No Shared Environment Variables found under ${chalk.bold(
        contextName
      )} ${chalk.gray(lsStamp())}`
    );
    return 0;
  }

  output.log(
    `Shared Environment Variables found under ${chalk.bold(contextName)} ${chalk.gray(
      lsStamp()
    )}`
  );
  client.stdout.write(`${getTable(envs)}\n`);

  if (pagination && pagination.next) {
    output.log(
      `To display the next page, run ${getCommandName(
        `env shared ls --next ${pagination.next}`
      )}`
    );
  }

  return 0;
}

/**
 * Explicitly builds the machine-readable shape from known metadata fields so a
 * decrypted value can never leak into JSON output.
 */
function toJson(envs: SharedEnvVariable[]) {
  return {
    envs: envs.map(env => ({
      id: env.id,
      key: env.key,
      type: env.type,
      target: env.target,
      projectCount: env.projectId?.length ?? 0,
      projectId: env.projectId ?? [],
      comment: env.comment,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
    })),
  };
}

function getTable(envs: SharedEnvVariable[]): string {
  const now = Date.now();
  return table(
    [
      ['name', 'environments', 'projects', 'created', 'updated'].map(header =>
        chalk.gray(header)
      ),
      ...envs.map(env => [
        chalk.bold(env.key ?? ''),
        formatTargets(env),
        `${env.projectId?.length ?? 0}`,
        env.createdAt ? `${ms(now - env.createdAt)} ago` : chalk.gray('-'),
        env.updatedAt ? `${ms(now - env.updatedAt)} ago` : chalk.gray('-'),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ');
}

function formatTargets(env: SharedEnvVariable): string {
  if (env.target && env.target.length > 0) {
    return env.target.join(', ');
  }
  if (env.applyToAllCustomEnvironments) {
    return 'All Custom Environments';
  }
  if (env.customEnvironmentIds && env.customEnvironmentIds.length > 0) {
    return `${env.customEnvironmentIds.length} Custom Environments`;
  }
  return chalk.gray('-');
}
