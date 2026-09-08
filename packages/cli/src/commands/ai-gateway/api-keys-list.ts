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
import {
  listScopeBudgetDefaults,
  type ScopeBudgetDefault,
} from '../../util/ai-gateway/budgets';

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

  // Default-capped keys render `$50 (default)`, not a dash reading as unlimited.
  let keyDefault: ScopeBudgetDefault | undefined;
  if (!formatResult.jsonOutput) {
    try {
      const defaults = await listScopeBudgetDefaults(client);
      keyDefault = defaults.find(
        d => d.scopeType === 'api-key' && d.active !== false
      );
    } catch {}
  }

  return renderResource<ApiKey[]>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching API keys',
    fetch: () => listApiKeys(client),
    toJSON: apiKeys => ({ apiKeys }),
    isEmpty: apiKeys => apiKeys.length === 0,
    emptyMessage: `No API keys found. Create one with ${getCommandName('ai-gateway api-keys create')}.`,
    header: () => 'API keys',
    renderTable: apiKeys => printApiKeysTable(apiKeys, keyDefault),
  });
}

function printApiKeysTable(apiKeys: ApiKey[], keyDefault?: ScopeBudgetDefault) {
  return `${table(
    [
      ['id', 'name', 'key', 'budget', 'spend', 'refresh', 'created'].map(
        header => chalk.gray(header)
      ),
      ...apiKeys.map(apiKey => [
        apiKey.id,
        apiKey.name || chalk.gray('–'),
        apiKey.partialKey ? `…${apiKey.partialKey}` : chalk.gray('–'),
        apiKey.quota
          ? `$${apiKey.quota.limitAmount}`
          : keyDefault
            ? `$${keyDefault.limitAmount} ${chalk.gray('(default)')}`
            : chalk.gray('–'),
        apiKey.quota ? `$${apiKey.quota.currentSpend}` : chalk.gray('–'),
        apiKey.quota?.refreshPeriod ??
          keyDefault?.refreshPeriod ??
          chalk.gray('–'),
        apiKey.createdAt
          ? new Date(apiKey.createdAt).toLocaleDateString()
          : chalk.gray('–'),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
