import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import {
  formatVariantForDisplay,
  resolveVariant,
} from '../../util/flags/resolve-variant';
import { logNonBooleanFlagGuidance } from '../../util/flags/log-non-boolean-guidance';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import {
  buildPausedEnvironmentConfig,
  getBooleanVariant,
  isPausingEnvironmentToVariant,
  resolveFlagEnvironment,
  resolveFlagUpdateMessage,
} from '../../util/flags/environment-variant';
import output from '../../output-manager';
import { FlagsDisableTelemetryClient } from '../../util/telemetry/commands/flags/disable';
import { disableSubcommand } from './command';

export default async function disable(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsDisableTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(disableSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  let environment = flags['--environment'] as string | undefined;
  const variantId = flags['--variant'] as string | undefined;
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to disable');
    output.log(
      `Example: ${getCommandName('flags disable my-feature --environment production')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionVariant(variantId);
  telemetryClient.trackCliOptionMessage(message);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    // Fetch the flag
    output.spinner('Fetching flag...');
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.error(
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be disabled`
      );
      return 1;
    }

    // Only boolean flags can be enabled/disabled via CLI
    if (flag.kind !== 'boolean') {
      logNonBooleanFlagGuidance(flag, {
        attemptedSubcommand: 'disable',
        environment,
        isInteractive: client.stdin.isTTY,
        teamSlug: link.org.slug,
        projectName: project.name,
      });
      return 0;
    }

    environment = await resolveFlagEnvironment(
      client,
      flag,
      environment,
      'Select an environment to disable the flag in:'
    );

    const envConfig = flag.environments[environment];
    let selectedVariant = getBooleanVariant(flag, false);

    if (variantId) {
      const result = resolveVariant(variantId, flag.variants);
      if (result.error) {
        output.error(result.error);
        return 1;
      }

      selectedVariant = result.variant!;
    }

    if (isPausingEnvironmentToVariant(envConfig, selectedVariant.id)) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already disabled in ${environment}`
      );
      return 0;
    }

    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      getDefaultDisableMessage(environment)
    );

    output.spinner(`Disabling flag in ${environment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [environment]: buildPausedEnvironmentConfig(
          envConfig,
          selectedVariant.id
        ),
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} has been disabled in ${chalk.bold(environment)}`
    );
    output.log(
      `  ${chalk.dim('Serving variant:')} ${formatVariantForDisplay(selectedVariant)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function getDefaultDisableMessage(environment: string): string {
  return `Disabled for ${environment} via CLI`;
}
