import { gray } from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { validateLsArgs } from '../../util/validate-ls-args';
import { exitWithNonInteractiveError } from '../../util/agent-output';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import output from '../../output-manager';
import { EdgeConfigLsTelemetryClient } from '../../util/telemetry/commands/edge-config/ls';
import { listSubcommand } from './command';
import type { EdgeConfigListEntry } from './resolve-edge-config-id';

type EdgeConfigRow = EdgeConfigListEntry & {
  itemCount?: number;
  sizeInBytes?: number;
  updatedAt?: number;
  digest?: string;
};

export default async function listCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EdgeConfigLsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(listSubcommand.options)
    );
  } catch (error) {
    if (client.nonInteractive) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'edge-config' });
    }
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const lsCheck = validateLsArgs({
    commandName: 'edge-config list',
    args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (lsCheck !== 0) {
    return lsCheck;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(flags['--format']);

  let rows: EdgeConfigRow[];
  try {
    rows = await client.fetch<EdgeConfigRow[]>('/v1/edge-config');
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }

  const { contextName } = await getScope(client);
  output.print(
    `${gray(`${rows.length} Edge Config${rows.length === 1 ? '' : 's'} found under ${contextName} ${stamp()}`)}\n`
  );

  if (rows.length === 0) {
    return 0;
  }

  const tableRows = [
    ['id', 'slug', 'items', 'size', 'updated'].map(h => gray(h)),
    ...rows.map(r => [
      r.id,
      r.slug,
      String(r.itemCount ?? ''),
      String(r.sizeInBytes ?? ''),
      r.updatedAt != null ? new Date(r.updatedAt).toISOString() : '',
    ]),
  ];
  client.stderr.write(`${table(tableRows, { hsep: 2 })}\n`);
  return 0;
}
