import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import getSharedEnvRecords, {
  type SharedEnvVariable,
} from '../../util/env/get-shared-env-records';
import table from '../../util/output/table';
import formatDate from '../../util/format-date';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { EnvSharedInspectTelemetryClient } from '../../util/telemetry/commands/env/shared-inspect';
import { sharedInspectSubcommand } from './command';

const ID_PREFIX = 'env_';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EnvSharedInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sharedInspectSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('env shared inspect <name-or-id>')}`
      )}`
    );
    return 1;
  }

  const [nameOrId] = args;

  telemetry.trackCliArgumentNameOrId(nameOrId);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const { contextName } = await getScope(client);

  const isId = nameOrId.startsWith(ID_PREFIX);

  output.spinner(
    `Fetching Shared Environment Variable under ${chalk.bold(contextName)}`
  );

  let records: SharedEnvVariable[];
  try {
    const data = await getSharedEnvRecords(
      client,
      // Resolve via the list endpoint (never the get-by-id endpoint) so the
      // decrypted secret value is never fetched, decrypted, or at risk of being
      // printed. All displayed metadata is present on the list record.
      isId ? { ids: nameOrId, limit: 100 } : { search: nameOrId, limit: 100 }
    );
    records = data.data;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  output.stopSpinner();

  const matches = isId
    ? records.filter(env => env.id === nameOrId)
    : records.filter(env => env.key === nameOrId);

  if (matches.length === 0) {
    output.error(
      `No Shared Environment Variable ${chalk.bold(
        nameOrId
      )} found under ${chalk.bold(contextName)}.`
    );
    return 1;
  }

  if (matches.length > 1) {
    output.error(
      `Multiple Shared Environment Variables named ${chalk.bold(
        nameOrId
      )} were found. Inspect one by ID instead:`
    );
    for (const env of matches) {
      const targets = env.target?.join(', ') || '-';
      output.print(`  ${env.id}  ${chalk.gray(targets)}\n`);
    }
    return 1;
  }

  const record = matches[0];

  if (asJson) {
    client.stdout.write(`${JSON.stringify(toJson(record), null, 2)}\n`);
    return 0;
  }

  output.log(
    `Shared Environment Variable ${chalk.bold(
      record.key ?? record.id
    )} under ${chalk.bold(contextName)}`
  );
  client.stdout.write(formatDetails(record));

  return 0;
}

/**
 * Explicitly builds the machine-readable shape from known metadata fields so a
 * decrypted value can never leak into JSON output.
 */
function toJson(env: SharedEnvVariable) {
  return {
    id: env.id,
    key: env.key,
    type: env.type,
    target: env.target,
    projectId: env.projectId ?? [],
    projectCount: env.projectId?.length ?? 0,
    applyToAllCustomEnvironments: env.applyToAllCustomEnvironments,
    customEnvironmentIds: env.customEnvironmentIds ?? [],
    comment: env.comment,
    createdAt: env.createdAt,
    updatedAt: env.updatedAt,
    createdBy: env.createdBy,
    updatedBy: env.updatedBy,
    lastEditedByDisplayName: env.lastEditedByDisplayName,
  };
}

function formatDetails(env: SharedEnvVariable): string {
  const rows: string[][] = [
    ['ID', env.id],
    ['Name', env.key ?? '-'],
    // Show the type as the encryption flag; the secret value is never printed.
    ['Type', env.type ?? 'encrypted'],
    ['Environments', env.target?.join(', ') || '-'],
  ];

  const projects = env.projectId ?? [];
  rows.push(['Linked Projects', projects.length ? `${projects.length}` : '0']);

  if (env.comment) {
    rows.push(['Comment', env.comment]);
  }

  rows.push(['Created', formatDate(env.createdAt)]);
  rows.push(['Updated', formatDate(env.updatedAt)]);
  if (env.lastEditedByDisplayName) {
    rows.push(['Last Edited By', env.lastEditedByDisplayName]);
  }

  let out = `${table(rows, { align: ['l', 'l'], hsep: 2 }).replace(
    /^(.*)/gm,
    '  $1'
  )}\n`;

  if (projects.length) {
    out += `\n  ${chalk.gray('Linked project IDs:')}\n`;
    for (const projectId of projects) {
      out += `  ${projectId}\n`;
    }
  }

  return out;
}
