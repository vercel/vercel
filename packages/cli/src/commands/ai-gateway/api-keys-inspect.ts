import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { getApiKey, type ApiKey } from '../../util/ai-gateway/api-keys';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import output from '../../output-manager';
import { AiGatewayApiKeysInspectTelemetryClient } from '../../util/telemetry/commands/ai-gateway/api-keys-inspect';
import { inspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new AiGatewayApiKeysInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const [id] = args;
  telemetry.trackCliArgumentId(id);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  if (!id) {
    output.error(
      `${getCommandName('ai-gateway api-keys inspect <id>')} expects an API key id.`
    );
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  return renderResource<ApiKey>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching API key',
    fetch: () => getApiKey(client, id),
    toJSON: apiKey => ({ apiKey }),
    isEmpty: () => false,
    emptyMessage: '',
    header: apiKey => `API key ${chalk.bold(apiKey.name || apiKey.id)}`,
    renderTable: printApiKeyDetails,
  });
}

function dim(value: string) {
  return chalk.gray(value);
}

function yesNo(value: boolean) {
  return value ? 'yes' : 'no';
}

function printApiKeyDetails(apiKey: ApiKey) {
  const rows: string[][] = [
    ['id', apiKey.id],
    ['name', apiKey.name || dim('–')],
    ['key', apiKey.partialKey ? `…${apiKey.partialKey}` : dim('–')],
    ['purpose', apiKey.purpose],
    ['project', apiKey.projectId ?? dim('all projects')],
    [
      'created',
      apiKey.createdAt ? new Date(apiKey.createdAt).toLocaleString() : dim('–'),
    ],
    [
      'last used',
      apiKey.activeAt
        ? new Date(apiKey.activeAt).toLocaleString()
        : dim('never'),
    ],
    [
      'expires',
      apiKey.expiresAt
        ? new Date(apiKey.expiresAt).toLocaleString()
        : dim('never'),
    ],
    ['created by', apiKey.createdBy || dim('–')],
  ];

  const quota = apiKey.quota;
  if (quota) {
    rows.push(
      ['budget', `$${quota.limitAmount}`],
      ['spend', `$${quota.currentSpend}`],
      ['byok spend', `$${quota.currentByokSpend}`],
      ['include byok', yesNo(quota.includeByokInQuota)],
      ['refresh', quota.refreshPeriod],
      [
        'alerts',
        quota.alertThresholds && quota.alertThresholds.length > 0
          ? quota.alertThresholds.map(threshold => `${threshold}%`).join(', ')
          : dim('none'),
      ],
      ['active', yesNo(quota.active)]
    );
  } else {
    rows.push(['budget', dim('none')]);
  }

  return `${table(
    rows.map(([label, value]) => [dim(label), value]),
    { align: ['l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
