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
  getFlagRulesEnvironmentConfig,
  moveFlagRule,
} from '../../util/flags/rules';
import output from '../../output-manager';
import { FlagsRulesCommandTelemetryClient } from '../../util/telemetry/commands/flags/rules';
import { rulesMoveSubcommand } from './command';
import { isExitCodeResult, resolveRulesCommandContext } from './rules-common';

export default async function rulesMove(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsRulesCommandTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rulesMoveSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg, ruleId] = args;
  const environment = flags['--environment'] as string | undefined;
  const position = flags['--position'] as number | undefined;
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliArgumentRule(ruleId);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionPosition(position);
  telemetryClient.trackCliOptionMessage(message);

  if (!flagArg || !ruleId || position === undefined) {
    output.error(
      'Please provide a flag slug or ID, rule ID, and destination position'
    );
    output.log(
      `Example: ${getCommandName('flags rules move my-feature rule_123 --environment production --position 1')}`
    );
    return 1;
  }

  try {
    const context = await resolveRulesCommandContext(client, {
      flagArg,
      environment,
      promptMessage: 'Select an environment containing the rule:',
      requireActiveFlag: true,
    });
    if (isExitCodeResult(context)) {
      return context.exitCode;
    }

    const envConfig = getFlagRulesEnvironmentConfig(
      context.flag,
      context.environment
    );
    const nextEnvConfig = moveFlagRule(envConfig, ruleId, position);
    if (deepEqual(context.envConfig, nextEnvConfig)) {
      output.warn(
        `Rule ${chalk.bold(ruleId)} is already at position ${position} in ${context.environment}`
      );
      return 0;
    }

    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      `Move rule ${ruleId} to position ${position} in ${context.environment}`
    );

    output.spinner(`Moving rule in ${context.environment}...`);
    await updateFlag(client, context.projectId, flagArg, {
      environments: {
        [context.environment]: nextEnvConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Rule ${chalk.bold(ruleId)} moved to position ${position} for ${chalk.bold(context.flag.slug)} in ${chalk.bold(context.environment)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
