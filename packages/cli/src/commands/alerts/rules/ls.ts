import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import chalk from 'chalk';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import { outputAgentError } from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { normalizeRepeatableStringFilters } from '../../../util/command-validation';
import { rulesLsSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  rulesCollectionPath,
} from './util';
import { formatGranularity } from '../../../util/output/format-granularity';
import {
  formatCustomAlertMetric,
  formatCustomAlertTrigger,
  formatRuleScope,
  isCustomAlertRule,
  parseCustomAlertQuery,
  renderAlertTable,
} from '../format';
import { truncateEnd } from '../../../util/output/truncate';
import type { AlertRule } from '../types';

interface ListFlags {
  '--project'?: string;
  '--all'?: boolean;
  '--type'?: string[];
  '--format'?: string;
}

function getCustomAlertRuleDetails(rule: AlertRule): string {
  const customAlert = rule.customAlert;
  if (!isCustomAlertRule(rule) || !customAlert) {
    return '';
  }

  const metric = formatCustomAlertMetric(customAlert);
  const trigger = formatCustomAlertTrigger(customAlert);
  const min =
    typeof customAlert.minThreshold === 'number'
      ? `min ${customAlert.minThreshold}`
      : undefined;
  const granularity = formatGranularity(
    parseCustomAlertQuery(customAlert.queryJsonString).granularity
  );
  const interval = granularity ? `every ${granularity}` : undefined;

  return [metric, trigger, min, interval].filter(Boolean).join('; ');
}

function ruleMatchesTypes(rule: AlertRule, types: string[]): boolean {
  if (types.length === 0) {
    return true;
  }

  return (
    rule.alertTypes?.some(alertType => types.includes(alertType.type)) ||
    (types.includes('custom_alert') && isCustomAlertRule(rule))
  );
}

function getRuleScope(rule: AlertRule): string {
  return formatRuleScope(rule.projectId, {
    projectIdMaxLength: 24,
    filterMaxLength: 24,
  });
}

function printRules(rules: AlertRule[]) {
  const showDetails = rules.some(rule => getCustomAlertRuleDetails(rule));
  const headers = [
    'Name',
    'Rule id',
    'Scope',
    ...(showDetails ? ['Details'] : []),
  ].map(h => chalk.cyan(h));
  const rows = [
    headers,
    ...rules.map(rule => {
      const row = [
        chalk.bold(truncateEnd(rule.name || '-', 44)),
        chalk.dim(rule.id || '-'),
        getRuleScope(rule),
      ];

      if (showDetails) {
        row.push(truncateEnd(getCustomAlertRuleDetails(rule) || '-', 72));
      }

      return row;
    }),
  ];
  output.print(`\n${renderAlertTable(rows, 2)}\n`);
}

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesLsSubcommand.options)
    );
  } catch (e) {
    emitRulesArgParseError(client, e, 'alerts rules ls --project <name-or-id>');
    printError(e);
    return 1;
  }

  const flags = parsedArgs.flags as ListFlags;
  const fr = validateJsonOutput(flags);
  if (!fr.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: fr.error,
      },
      1
    );
    output.error(fr.error);
    return 1;
  }

  const scope = await parseRulesFlagsAndScope(
    client,
    {
      '--project': flags['--project'],
      '--all': flags['--all'],
    },
    fr.jsonOutput,
    'alerts rules ls'
  );
  if (typeof scope === 'number') {
    return scope;
  }

  const path = rulesCollectionPath(scope);
  output.spinner('Fetching alert rules...');
  try {
    const rules = await client.fetch<AlertRule[]>(path);
    const types = normalizeRepeatableStringFilters(flags['--type']);
    const filteredRules = rules.filter(rule => ruleMatchesTypes(rule, types));
    if (fr.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ rules: filteredRules }, null, 2)}\n`
      );
    } else if (filteredRules.length === 0) {
      output.log('No alert rules found for this scope.');
    } else {
      printRules(filteredRules);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleRulesApiError(client, err, fr.jsonOutput);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
