import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import { resolveFlagUpdateMessage } from '../../util/flags/environment-variant';
import {
  addFlagRule,
  createFlagRule,
  formatFlagRuleOutcome,
  getFlagRulesEnvironmentConfig,
  needsFlagRuleOutcomeSettings,
  parseFlagRuleConditions,
  resolveFlagRuleOutcome,
} from '../../util/flags/rules';
import output from '../../output-manager';
import { FlagsRulesCommandTelemetryClient } from '../../util/telemetry/commands/flags/rules';
import { rulesAddSubcommand } from './command';
import { isExitCodeResult, resolveRulesCommandContext } from './rules-common';

export default async function rulesAdd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsRulesCommandTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rulesAddSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
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
  const position = flags['--position'] as number | undefined;
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  telemetryClient.trackCliArgumentFlag(flagArg);
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
  telemetryClient.trackCliOptionPosition(position);
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

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to add a rule to');
    output.log(
      `Example: ${getCommandName('flags rules add my-feature --environment production --condition user.plan:eq:pro --variant on')}`
    );
    return 1;
  }

  try {
    const context = await resolveRulesCommandContext(client, {
      flagArg,
      environment,
      promptMessage: 'Select an environment to add the rule to:',
      requireActiveFlag: true,
      fetchSettings: needsFlagRuleOutcomeSettings(outcomeOptions),
    });
    if (isExitCodeResult(context)) {
      return context.exitCode;
    }

    const conditions = parseFlagRuleConditions(conditionInputs);
    const outcome = resolveFlagRuleOutcome(context.flag, context.settings, {
      ...outcomeOptions,
      requireOutcome: true,
    });
    const rule = createFlagRule(conditions, outcome);
    const envConfig = getFlagRulesEnvironmentConfig(
      context.flag,
      context.environment
    );
    const nextEnvConfig = addFlagRule(envConfig, rule, position);
    const nextPosition =
      nextEnvConfig.rules.findIndex(candidate => candidate.id === rule.id) + 1;
    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      `Add rule ${rule.id} to ${context.environment}`
    );

    output.spinner(`Adding rule to ${context.environment}...`);
    await updateFlag(client, context.projectId, flagArg, {
      environments: {
        [context.environment]: nextEnvConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Rule ${chalk.bold(rule.id)} added to ${chalk.bold(context.flag.slug)} in ${chalk.bold(context.environment)}`
    );
    output.log(`  ${chalk.dim('Position:')} ${nextPosition}`);
    output.log(
      `  ${chalk.dim('Outcome:')} ${formatFlagRuleOutcome(
        rule.outcome,
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
