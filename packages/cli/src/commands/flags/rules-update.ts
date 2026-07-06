import chalk from 'chalk';
import deepEqual from 'fast-deep-equal';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import { resolveFlagUpdateMessage } from '../../util/flags/environment-variant';
import {
  findFlagRule,
  formatFlagRuleCondition,
  formatFlagRuleOutcome,
  getFlagRulesEnvironmentConfig,
  hasFlagRuleOutcomeOptions,
  needsFlagRuleOutcomeSettings,
  parseFlagRuleConditions,
  resolveFlagRuleOutcome,
  updateFlagRule,
} from '../../util/flags/rules';
import output from '../../output-manager';
import { FlagsRulesCommandTelemetryClient } from '../../util/telemetry/commands/flags/rules';
import { rulesUpdateSubcommand } from './command';
import { isExitCodeResult, resolveRulesCommandContext } from './rules-common';

export default async function rulesUpdate(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsRulesCommandTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    rulesUpdateSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg, ruleId] = args;
  const environment = flags['--environment'] as string | undefined;
  const conditionInputs = (flags['--condition'] as string[] | undefined) ?? [];
  const variantSelector = normalizeOptionalInput(
    flags['--variant'] as string | undefined
  );
  const baseSelector = normalizeOptionalInput(
    flags['--by'] as string | undefined
  );
  const defaultVariantSelector = normalizeOptionalInput(
    flags['--default-variant'] as string | undefined
  );
  const weightInputs = (flags['--weight'] as string[] | undefined) ?? [];
  const rollFromVariantSelector = normalizeOptionalInput(
    flags['--from-variant'] as string | undefined
  );
  const rollToVariantSelector = normalizeOptionalInput(
    flags['--to-variant'] as string | undefined
  );
  const stageInputs = ((flags['--stage'] as string[] | undefined) ?? []).map(
    input => input.trim()
  );
  const start = normalizeOptionalInput(flags['--start'] as string | undefined);
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliArgumentRule(ruleId);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionCondition(conditionInputs);
  telemetryClient.trackCliOptionVariant(variantSelector);
  telemetryClient.trackCliOptionBy(baseSelector);
  telemetryClient.trackCliOptionWeight(weightInputs);
  telemetryClient.trackCliOptionDefaultVariant(defaultVariantSelector);
  telemetryClient.trackCliOptionFromVariant(rollFromVariantSelector);
  telemetryClient.trackCliOptionToVariant(rollToVariantSelector);
  telemetryClient.trackCliOptionStage(stageInputs);
  telemetryClient.trackCliOptionStart(start);
  telemetryClient.trackCliOptionMessage(message);

  const outcomeOptions = {
    variantSelector,
    baseSelector,
    defaultVariantSelector,
    weightInputs,
    rollFromVariantSelector,
    rollToVariantSelector,
    stageInputs,
    start,
  };

  if (!flagArg || !ruleId) {
    output.error('Please provide a flag slug or ID and rule ID to update');
    output.log(
      `Example: ${getCommandName('flags rules update my-feature rule_123 --environment production --variant on')}`
    );
    return 1;
  }

  try {
    const context = await resolveRulesCommandContext(client, {
      flagArg,
      environment,
      promptMessage: 'Select an environment containing the rule:',
      requireActiveFlag: true,
      fetchSettings: needsFlagRuleOutcomeSettings(outcomeOptions),
    });
    if (isExitCodeResult(context)) {
      return context.exitCode;
    }

    const envConfig = getFlagRulesEnvironmentConfig(
      context.flag,
      context.environment
    );
    const currentRule = findFlagRule(envConfig.rules ?? [], ruleId);
    const hasOutcomeOptions = hasFlagRuleOutcomeOptions(outcomeOptions);
    const nextConditions =
      conditionInputs.length > 0
        ? parseFlagRuleConditions(conditionInputs)
        : undefined;
    const resolvedOutcome = hasOutcomeOptions
      ? resolveFlagRuleOutcome(context.flag, context.settings, {
          ...outcomeOptions,
          currentOutcome: currentRule.outcome,
        })
      : undefined;

    if (!nextConditions && !resolvedOutcome) {
      output.warn('No rule changes were provided');
      return 0;
    }

    const nextEnvConfig = updateFlagRule(envConfig, ruleId, {
      conditions: nextConditions,
      outcome: resolvedOutcome,
    });

    if (deepEqual(context.envConfig, nextEnvConfig)) {
      output.warn('No rule changes were provided');
      return 0;
    }

    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      `Update rule ${ruleId} in ${context.environment}`
    );

    output.spinner(`Updating rule in ${context.environment}...`);
    await updateFlag(client, context.projectId, flagArg, {
      environments: {
        [context.environment]: nextEnvConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    const nextRule = findFlagRule(nextEnvConfig.rules, ruleId);
    output.success(
      `Rule ${chalk.bold(ruleId)} updated for ${chalk.bold(context.flag.slug)} in ${chalk.bold(context.environment)}`
    );
    output.log(
      `  ${chalk.dim('Conditions:')} ${nextRule.conditions
        .map(formatFlagRuleCondition)
        .join(', ')}`
    );
    output.log(
      `  ${chalk.dim('Outcome:')} ${formatFlagRuleOutcome(
        nextRule.outcome,
        context.flag.variants
      )}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
