import type { Alias } from '@vercel-internals/types';
import chalk from 'chalk';
import ms from 'ms';
import output from '../../output-manager';
import getAliases from '../../util/alias/get-aliases';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getCommandFlags from '../../util/get-command-flags';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getPaginationOpts } from '../../util/get-pagination-opts';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import { AliasListTelemetryClient } from '../../util/telemetry/commands/alias/list';
import { validateLsArgs } from '../../util/validate-ls-args';
import { listSubcommand } from './command';

export default async function ls(client: Client, argv: string[]) {
  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(listSubcommand.options);

  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArguments;

  const validationResult = validateLsArgs({
    commandName: 'alias ls',
    args: args,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  const { contextName } = await getScope(client);

  const telemetryClient = new AliasListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  let paginationOptions;

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  try {
    paginationOptions = getPaginationOpts(opts);
    const [next, limit] = paginationOptions;

    telemetryClient.trackCliOptionNext(next);
    telemetryClient.trackCliOptionLimit(limit);
    telemetryClient.trackCliOptionFormat(opts['--format']);
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }

  const lsStamp = stamp();

  output.spinner(`Fetching aliases under ${chalk.bold(contextName)}`);

  // Get the list of alias
  const { aliases, pagination } = await getAliases(
    client,
    undefined,
    ...paginationOptions
  );

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      aliases: aliases.map(a => ({
        alias: a.alias,
        deploymentId: a.deploymentId,
        url: a.deployment?.url ?? null,
        createdAt: a.createdAt,
      })),
      pagination,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
    output.log(`aliases found under ${chalk.bold(contextName)} ${lsStamp()}`);
    client.stdout.write(printAliasTable(aliases));

    if (pagination.count === 20) {
      const flags = getCommandFlags(opts, ['_', '--next', '--format']);
      output.log(
        `To display the next page run ${getCommandName(
          `alias ls${flags} --next ${pagination.next}`
        )}`
      );
    }
  }

  return 0;
}

function printAliasTable(aliases: Alias[]) {
  return `${table(
    [
      ['source', 'url', 'age'].map(header => chalk.gray(header)),
      ...aliases.map(a => [
        // for legacy reasons, we might have situations
        // where the deployment was deleted and the alias
        // not collected appropriately, and we need to handle it
        a.deployment?.url ? a.deployment.url : chalk.gray('–'),
        a.alias,
        ms(Date.now() - a.createdAt),
      ]),
    ],
    { align: ['l', 'l', 'r'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
