import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listRules, type Rule } from '../../util/ai-gateway/rules';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayRulesListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/rules-list';
import { rulesListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

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
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const includeDisabled = opts['--include-disabled'] as boolean | undefined;
  telemetry.trackCliFlagIncludeDisabled(includeDisabled);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const lsStamp = stamp();
  output.spinner('Fetching routing rules');

  let rules: Rule[];
  try {
    rules = await listRules(client, Boolean(includeDisabled));
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ rules }, null, 2)}\n`);
    return 0;
  }

  if (rules.length === 0) {
    output.log(
      `No routing rules found. Add one with ${getCommandName('ai-gateway rules add')}.`
    );
    return 0;
  }

  output.log(`Routing rules ${lsStamp()}`);
  client.stdout.write(printRulesTable(rules));
  return 0;
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
