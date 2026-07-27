import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listApiKeys, type ApiKey } from '../../util/ai-gateway/api-keys';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import output from '../../output-manager';
import { AiGatewayApiKeysListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/api-keys-list';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayApiKeysListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  return renderResource<ApiKey[]>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching API keys',
    fetch: () => listApiKeys(client),
    toJSON: apiKeys => ({ apiKeys }),
    isEmpty: apiKeys => apiKeys.length === 0,
    emptyMessage: `No API keys found. Create one with ${getCommandName('ai-gateway api-keys create')}.`,
    header: () => 'API keys',
    renderTable: printApiKeysTable,
  });
}

function printApiKeysTable(apiKeys: ApiKey[]) {
  return `${table(
    [
      ['id', 'name', 'key', 'budget', 'spend', 'refresh', 'created'].map(
        header => chalk.gray(header)
      ),
      ...apiKeys.map(apiKey => [
        apiKey.id,
        apiKey.name || chalk.gray('–'),
        apiKey.partialKey ? `…${apiKey.partialKey}` : chalk.gray('–'),
        apiKey.quota ? `$${apiKey.quota.limitAmount}` : chalk.gray('–'),
        apiKey.quota ? `$${apiKey.quota.currentSpend}` : chalk.gray('–'),
        apiKey.quota?.refreshPeriod ?? chalk.gray('–'),
        apiKey.createdAt
          ? new Date(apiKey.createdAt).toLocaleDateString()
          : chalk.gray('–'),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
