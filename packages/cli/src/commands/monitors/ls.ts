import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { normalizeRepeatableStringFilters } from '../../util/command-validation';
import type { MonitorsTelemetryClient } from '../../util/telemetry/commands/monitors';
import { monitorsLsSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import { printRules } from './format';
import { BUILT_IN_ALERT_TYPES } from './types';
import type {
  AlertRulesPage,
  MonitorsApi,
  PublicAlertRule,
  PublicAlertRuleType,
} from './types';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  outputRulesError,
  rulesCollectionPath,
} from './util';

interface ListFlags {
  '--project'?: string;
  '--all'?: boolean;
  '--type'?: string[];
  '--format'?: string;
  '--json'?: boolean;
}

const BUILT_IN_ALERT_TYPE_SET = new Set<string>(BUILT_IN_ALERT_TYPES);

interface RuleTypeFilter {
  apiType: PublicAlertRuleType | undefined;
  matches: (rule: PublicAlertRule) => boolean;
}

function parseRuleTypeFilter(
  client: Client,
  values: string[] | undefined,
  jsonOutput: boolean
): RuleTypeFilter | number | undefined {
  const types = normalizeRepeatableStringFilters(values);
  if (types.length === 0) return undefined;

  const invalidType = types.find(
    type =>
      type !== 'built-in' &&
      type !== 'custom' &&
      type !== 'custom_alert' &&
      !BUILT_IN_ALERT_TYPE_SET.has(type)
  );
  if (invalidType) {
    return outputRulesError(
      client,
      jsonOutput,
      'INVALID_RULE_TYPE',
      `Invalid monitor type "${invalidType}". Expected a supported monitor type or built-in trigger type.`
    );
  }

  const includeCustom =
    types.includes('custom') || types.includes('custom_alert');
  const includeAllBuiltIn = types.includes('built-in');
  const builtInAlertTypes = new Set(
    types.filter(type => BUILT_IN_ALERT_TYPE_SET.has(type))
  );
  const includeBuiltIn = includeAllBuiltIn || builtInAlertTypes.size > 0;
  const apiType =
    includeCustom === includeBuiltIn
      ? undefined
      : includeCustom
        ? 'custom'
        : 'built-in';

  return {
    apiType,
    matches(rule) {
      if (rule.type === 'custom') return includeCustom;
      if (includeAllBuiltIn) return true;
      if (!includeBuiltIn) return false;
      if (rule.triggers.mode === 'all') return true;
      return rule.triggers.items.some(trigger =>
        builtInAlertTypes.has(trigger.type)
      );
    },
  };
}

export default async function ls(
  client: Client,
  argv: string[],
  api: MonitorsApi,
  telemetry?: MonitorsTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(monitorsLsSubcommand.options)
    );
  } catch (error) {
    emitRulesArgParseError(client, error, 'monitors ls --project <name-or-id>');
    printError(error);
    return 2;
  }

  const flags = parsedArgs.flags as ListFlags;
  telemetry?.trackCliOptionType(flags['--type']);
  telemetry?.trackCliFlagAll(flags['--all']);
  telemetry?.trackCliFlagJson(flags['--json']);
  const format = validateJsonOutput(flags);
  if (!format.valid) {
    return outputRulesError(client, false, 'INVALID_ARGUMENTS', format.error);
  }

  const typeFilter = parseRuleTypeFilter(
    client,
    flags['--type'],
    format.jsonOutput
  );
  if (typeof typeFilter === 'number') return typeFilter;

  const scope = await parseRulesFlagsAndScope(
    client,
    {
      '--project': flags['--project'],
      '--all': flags['--all'],
    },
    format.jsonOutput,
    'monitors ls'
  );
  if (typeof scope === 'number') return scope;

  output.spinner('Fetching monitors…');
  try {
    const rules: PublicAlertRule[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.fetch<AlertRulesPage>(
        rulesCollectionPath(api, scope.teamId, {
          limit: 100,
          cursor,
          projectId: scope.projectId,
          type: typeFilter?.apiType,
        })
      );
      rules.push(...page[api.listKey]);
      cursor = page.pagination.next ?? undefined;
    } while (cursor);

    const filteredRules = typeFilter ? rules.filter(typeFilter.matches) : rules;

    if (format.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ [api.listKey]: filteredRules }, null, 2)}\n`
      );
    } else if (filteredRules.length === 0) {
      output.log('No monitors found for this scope');
    } else {
      printRules(filteredRules);
    }
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      return handleRulesApiError(client, error, format.jsonOutput);
    }
    throw error;
  } finally {
    output.stopSpinner();
  }
}
