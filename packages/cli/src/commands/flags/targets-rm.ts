import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import { resolveFlagUpdateMessage } from '../../util/flags/environment-variant';
import {
  buildTargetsEnvironmentConfig,
  parseFlagTargetInput,
  removeFlagTargets,
} from '../../util/flags/targets';
import output from '../../output-manager';
import { FlagsTargetsCommandTelemetryClient } from '../../util/telemetry/commands/flags/targets';
import { targetsRemoveSubcommand } from './command';
import {
  isExitCodeResult,
  resolveRulesCommandContext,
  warnIfRuleChangesAreBypassed,
} from './rules-common';
import { formatTargetValue, formatTargetVariant } from './targets-common';

const EXAMPLE =
  'flags targets remove my-feature --environment production user.id=user_123';

export default async function targetsRemove(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsTargetsCommandTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    targetsRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const { args, flags } = parsedArgs;
  const [flagArg, ...targetInputs] = args;
  const environment = flags['--environment'] as string | undefined;
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliArgumentTarget(targetInputs);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionMessage(message);
  telemetryClient.trackCliFlagJson(json);
  telemetryClient.trackCliOptionProject(flags['--project']);

  if (!flagArg || targetInputs.length === 0) {
    output.error(
      'Please provide a flag slug or ID and at least one target as ENTITY.ATTRIBUTE=VALUE'
    );
    output.log(`Example: ${getCommandName(EXAMPLE)}`);
    return 2;
  }

  if (json && !environment) {
    output.error('Missing required option --environment when using --json');
    output.log(`Example: ${getCommandName(`${EXAMPLE} --json`)}`);
    return 2;
  }

  try {
    const selectors = targetInputs.map(input => parseFlagTargetInput(input));

    const context = await resolveRulesCommandContext(client, {
      projectName: flags['--project'],
      flagArg,
      environment,
      promptMessage: 'Select an environment to remove targets from:',
      fetchSettings: !json,
    });
    if (isExitCodeResult(context)) {
      return context.exitCode;
    }

    const { targets, results } = removeFlagTargets(
      context.envConfig.targets,
      selectors
    );

    const defaultMessage = `Remove ${plural('target', results.length, true)} from ${context.environment}`;
    const updateMessage = json
      ? (message ?? defaultMessage)
      : await resolveFlagUpdateMessage(client, message, defaultMessage);

    output.spinner(`Removing targets from ${context.environment}...`);
    const updatedFlag = await updateFlag(client, context.projectId, flagArg, {
      environments: {
        [context.environment]: buildTargetsEnvironmentConfig(
          context.flag,
          context.environment,
          targets
        ),
      },
      message: updateMessage,
    });
    output.stopSpinner();

    if (json) {
      client.stdout.write(
        `${JSON.stringify(
          {
            flag: updatedFlag.slug,
            environment: context.environment,
            targets:
              updatedFlag.environments[context.environment]?.targets ?? targets,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.success(
      `${plural('target', results.length, true)} removed from ${chalk.bold(context.flag.slug)} in ${chalk.bold(context.environment)}`
    );
    for (const result of results) {
      output.log(
        `  ${formatTargetValue(result, context.settings)} ${chalk.dim('(was')} ${formatTargetVariant(context.flag, result.variantId)}${chalk.dim(')')}`
      );
    }
    warnIfRuleChangesAreBypassed(updatedFlag, context.environment, 'target');
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
