import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import {
  formatFlagRuleCondition,
  formatFlagRuleOutcome,
  resolveEffectiveFlagRulesEnvironment,
} from '../../util/flags/rules';
import output from '../../output-manager';
import { FlagsRulesCommandTelemetryClient } from '../../util/telemetry/commands/flags/rules';
import { rulesListSubcommand } from './command';
import { isExitCodeResult, resolveRulesCommandContext } from './rules-common';
import type { FlagRule } from '../../util/flags/types';

export default async function rulesLs(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsRulesCommandTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rulesListSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const environment = flags['--environment'] as string | undefined;
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliFlagJson(json);

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to list rules for');
    output.log(
      `Example: ${getCommandName('flags rules ls my-feature --environment production')}`
    );
    return 1;
  }

  try {
    const context = await resolveRulesCommandContext(client, {
      flagArg,
      environment,
      promptMessage: 'Select an environment to list rules for:',
    });
    if (isExitCodeResult(context)) {
      return context.exitCode;
    }

    const effectiveEnvironment = resolveEffectiveFlagRulesEnvironment(
      context.flag,
      context.environment
    );
    const rules = effectiveEnvironment.envConfig.rules ?? [];
    if (json) {
      outputJson(client, {
        flag: context.flag.slug,
        environment: context.environment,
        inheritedFrom: effectiveEnvironment.inheritedFrom,
        rules,
      });
      return 0;
    }

    const lsStamp = stamp();
    const environmentLabel = effectiveEnvironment.inheritedFrom
      ? `${context.environment} (reuses ${effectiveEnvironment.inheritedFrom})`
      : context.environment;
    if (rules.length === 0) {
      output.log(
        `No conditional rules found for ${chalk.bold(context.flag.slug)} in ${environmentLabel} ${chalk.gray(lsStamp())}`
      );
      output.log(
        `\nAdd one with: ${getCommandName('flags rules add ' + context.flag.slug + ' --environment ' + context.environment + ' --condition user.plan:eq:pro --variant on')}`
      );
      return 0;
    }

    output.log(
      `${plural('conditional rule', rules.length, true)} found for ${chalk.bold(context.flag.slug)} in ${environmentLabel} ${chalk.gray(lsStamp())}`
    );
    printRulesTable(rules, context.flag.variants);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function outputJson(
  client: Client,
  data: {
    flag: string;
    environment: string;
    inheritedFrom?: string;
    rules: FlagRule[];
  }
) {
  client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function printRulesTable(
  rules: FlagRule[],
  variants: Parameters<typeof formatFlagRuleOutcome>[1]
) {
  const headers = ['Position', 'ID', 'Conditions', 'Outcome'];
  const rows = rules.map((rule, index) => [
    String(index + 1),
    chalk.bold(rule.id),
    rule.conditions.map(formatFlagRuleCondition).join('; '),
    formatFlagRuleOutcome(rule.outcome, variants),
  ]);

  const table = formatTable(
    headers,
    ['r', 'l', 'l', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}
