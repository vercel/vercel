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
  getFlagRulesEnvironmentConfig,
  removeFlagRule,
} from '../../util/flags/rules';
import output from '../../output-manager';
import { FlagsRulesCommandTelemetryClient } from '../../util/telemetry/commands/flags/rules';
import { rulesRemoveSubcommand } from './command';
import { isExitCodeResult, resolveRulesCommandContext } from './rules-common';

export default async function rulesRemove(
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
    rulesRemoveSubcommand.options
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
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliArgumentRule(ruleId);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionMessage(message);

  if (!flagArg || !ruleId) {
    output.error('Please provide a flag slug or ID and rule ID to remove');
    output.log(
      `Example: ${getCommandName('flags rules rm my-feature rule_123 --environment production')}`
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
    const nextEnvConfig = removeFlagRule(envConfig, ruleId);
    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      `Remove rule ${ruleId} from ${context.environment}`
    );

    output.spinner(`Removing rule from ${context.environment}...`);
    await updateFlag(client, context.projectId, flagArg, {
      environments: {
        [context.environment]: nextEnvConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Rule ${chalk.bold(ruleId)} removed from ${chalk.bold(context.flag.slug)} in ${chalk.bold(context.environment)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
