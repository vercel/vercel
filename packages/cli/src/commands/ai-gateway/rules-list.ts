import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listRulesPage, type Rule } from '../../util/ai-gateway/rules';
import { parseListLimit, type Page } from '../../util/pagination';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import output from '../../output-manager';
import { AiGatewayRulesListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-list';
import { rulesListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayRulesListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rulesListSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts } = parsedArgs;

  const includeDisabled = opts['--include-disabled'] as boolean | undefined;
  const limitFlag = opts['--limit'] as number | undefined;
  const next = opts['--next'] as string | undefined;
  telemetry.trackCliFlagIncludeDisabled(includeDisabled);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionNext(next);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }

  let limit: number;
  try {
    limit = parseListLimit(limitFlag);
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  return renderResource<Page<Rule>>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching routing rules',
    fetch: () =>
      listRulesPage(client, {
        limit,
        next,
        includeDisabled: Boolean(includeDisabled),
      }),
    toJSON: page => ({
      rules: page.items,
      pagination: { next: page.next },
    }),
    isEmpty: page => page.items.length === 0,
    emptyMessage: next
      ? 'No more rules.'
      : `No routing rules found. Add one with ${getCommandName('ai-gateway rules add')}.`,
    header: () => 'Routing rules',
    renderTable: page => printRulesTable(page.items),
    next: page => page.next,
  });
}

function printRulesTable(rules: Rule[]) {
  return `${table(
    [
      ['id', 'type', 'model', 'action', 'enabled'].map(header =>
        chalk.gray(header)
      ),
      ...rules.map(rule => [
        rule.ruleId,
        rule.type,
        rule.match?.model ?? chalk.gray('–'),
        rule.type === 'rewrite'
          ? `→ ${rule.action?.rewriteModel ?? chalk.gray('–')}`
          : chalk.gray('deny'),
        rule.enabled === false ? chalk.gray('no') : 'yes',
      ]),
    ],
    { align: ['l', 'l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
