import chalk from 'chalk';
import deepEqual from 'fast-deep-equal';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag, getFlagSettings } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import {
  resolveFlagEnvironment,
  resolveFlagUpdateMessage,
} from '../../util/flags/environment-variant';
import {
  resolveFlagRollout,
  type ResolvedFlagRollout,
} from '../../util/flags/rollout';
import type { Flag } from '../../util/flags/types';
import output from '../../output-manager';
import { FlagsRolloutTelemetryClient } from '../../util/telemetry/commands/flags/rollout';
import { rolloutSubcommand } from './command';

export default async function rollout(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsRolloutTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rolloutSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const environment = flags['--environment'] as string | undefined;
  const rollFromVariantSelector = normalizeOptionalInput(
    flags['--from-variant'] as string | undefined
  );
  const rollToVariantSelector = normalizeOptionalInput(
    flags['--to-variant'] as string | undefined
  );
  const defaultVariantSelector = normalizeOptionalInput(
    flags['--default-variant'] as string | undefined
  );
  const baseSelector = normalizeOptionalInput(
    flags['--by'] as string | undefined
  );
  const stageInputs = ((flags['--stage'] as string[] | undefined) || []).map(
    input => input.trim()
  );
  const start = normalizeOptionalInput(flags['--start'] as string | undefined);
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to roll out');
    output.log(
      `Example: ${getCommandName('flags rollout my-feature --environment production --by user.userId --stage 5,6h --stage 25,1d')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionFromVariant(rollFromVariantSelector);
  telemetryClient.trackCliOptionToVariant(rollToVariantSelector);
  telemetryClient.trackCliOptionDefaultVariant(defaultVariantSelector);
  telemetryClient.trackCliOptionBy(baseSelector);
  telemetryClient.trackCliOptionStage(
    stageInputs.length > 0 ? [stageInputs[0]] : undefined
  );
  telemetryClient.trackCliOptionStart(start);
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
    output.spinner('Fetching flag...');
    const [flag, settings] = await Promise.all([
      getFlag(client, project.id, flagArg),
      getFlagSettings(client, project.id),
    ]);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.error(
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be rolled out`
      );
      return 1;
    }

    const selectedEnvironment = await resolveFlagEnvironment(
      client,
      flag,
      environment,
      'Select an environment to roll out in:',
      {
        showEnvironmentDetails: true,
        decorateChoices: false,
      }
    );

    const rolloutConfig = resolveFlagRollout(flag, settings, {
      stageInputs,
      baseSelector,
      rollFromVariantSelector,
      rollToVariantSelector,
      defaultVariantSelector,
      start,
      currentOutcome: flag.environments[selectedEnvironment].fallthrough,
    });
    const nextEnvironmentConfig = buildRolloutEnvironmentConfig(
      flag.environments[selectedEnvironment],
      rolloutConfig
    );

    if (
      flag.environments[selectedEnvironment].active &&
      deepEqual(
        flag.environments[selectedEnvironment].fallthrough,
        rolloutConfig.outcome
      ) &&
      deepEqual(flag.environments[selectedEnvironment], nextEnvironmentConfig)
    ) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already configured with this rollout in ${selectedEnvironment}`
      );
      return 0;
    }

    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      getDefaultRolloutMessage(selectedEnvironment, rolloutConfig)
    );

    output.spinner(`Updating rollout in ${selectedEnvironment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [selectedEnvironment]: nextEnvironmentConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} rollout has been updated in ${chalk.bold(selectedEnvironment)}`
    );
    output.log(`  ${chalk.dim('Based on:')} ${rolloutConfig.baseLabel}`);
    output.log(
      `  ${chalk.dim('Roll from:')} ${formatVariantLabel(rolloutConfig.rollFromVariant)}`
    );
    output.log(
      `  ${chalk.dim('Roll to:')} ${formatVariantLabel(rolloutConfig.rollToVariant)}`
    );
    output.log(
      `  ${chalk.dim('Fallback:')} ${formatVariantLabel(rolloutConfig.defaultVariant)}`
    );
    output.log(`  ${chalk.dim('Start:')} ${rolloutConfig.startLabel}`);
    output.log(`  ${chalk.dim('Stages:')} ${rolloutConfig.summary}`);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function buildRolloutEnvironmentConfig(
  envConfig: Flag['environments'][string],
  rolloutConfig: ResolvedFlagRollout
) {
  return {
    ...envConfig,
    active: true,
    reuse: envConfig.reuse
      ? {
          ...envConfig.reuse,
          active: false,
        }
      : undefined,
    pausedOutcome: envConfig.pausedOutcome || {
      type: 'variant' as const,
      variantId: rolloutConfig.defaultVariant.id,
    },
    fallthrough: rolloutConfig.outcome,
  };
}

function getDefaultRolloutMessage(
  environment: string,
  rolloutConfig: ResolvedFlagRollout
): string {
  return `Configure rollout for ${environment}: ${rolloutConfig.summary}`;
}

function formatVariantLabel(variant: { label?: string; id: string }) {
  return variant.label || variant.id;
}
