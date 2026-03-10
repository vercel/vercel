import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import {
  formatVariantForDisplay,
  resolveVariant,
} from '../../util/flags/resolve-variant';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import {
  buildVariantOverrideEnvironmentConfig,
  isOverridingEnvironmentToVariant,
  resolveFlagEnvironment,
  resolveFlagUpdateMessage,
} from '../../util/flags/environment-variant';
import output from '../../output-manager';
import { FlagsSetTelemetryClient } from '../../util/telemetry/commands/flags/set';
import { setSubcommand } from './command';
import type { Flag, FlagVariant } from '../../util/flags/types';

export default async function set(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSetTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(setSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const environment = flags['--environment'] as string | undefined;
  const variantSelector = normalizeOptionalInput(
    flags['--variant'] as string | undefined
  );
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to set');
    output.log(
      `Example: ${getCommandName('flags set my-feature --environment production --variant true')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionVariant(variantSelector);
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
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.error(
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be set`
      );
      return 1;
    }

    const selectedEnvironment = await resolveFlagEnvironment(
      client,
      flag,
      environment,
      'Select an environment to set the variant in:'
    );
    const selectedVariant = await resolveVariantToSet(
      client,
      flag,
      variantSelector
    );
    const envConfig = flag.environments[selectedEnvironment];

    if (isOverridingEnvironmentToVariant(envConfig, selectedVariant.id)) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already serving ${formatVariantForDisplay(selectedVariant)} in ${selectedEnvironment}`
      );
      return 0;
    }

    const presentation = getSetPresentation(flag, selectedVariant);
    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      presentation.defaultMessage(selectedEnvironment)
    );

    output.spinner(presentation.spinner(selectedEnvironment));
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [selectedEnvironment]: buildVariantOverrideEnvironmentConfig(
          envConfig,
          selectedVariant.id
        ),
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(presentation.success(flag.slug, selectedEnvironment));
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

async function resolveVariantToSet(
  client: Client,
  flag: Flag,
  selector: string | undefined
): Promise<FlagVariant> {
  if (selector) {
    const result = resolveVariant(selector, flag.variants);
    if (result.error || !result.variant) {
      throw new Error(result.error || `Variant "${selector}" not found`);
    }

    return result.variant;
  }

  if (!client.stdin.isTTY) {
    throw new Error(
      'Missing required flag --variant. Use --variant <VARIANT>, or run interactively in a terminal.'
    );
  }

  const selectedVariantId = await client.input.select({
    message: 'Select a variant to serve:',
    choices: flag.variants.map(variant => ({
      name: `${formatVariantForDisplay(variant)} ${chalk.dim(`[id: ${variant.id}]`)}`,
      value: variant.id,
    })),
  });

  const selectedVariant = flag.variants.find(
    variant => variant.id === selectedVariantId
  );
  if (!selectedVariant) {
    throw new Error('No variant selected');
  }

  return selectedVariant;
}

function getSetPresentation(flag: Flag, variant: FlagVariant) {
  if (flag.kind === 'boolean' && variant.value === true) {
    return {
      spinner: (environment: string) => `Enabling flag in ${environment}...`,
      success: (slug: string, environment: string) =>
        `Feature flag ${chalk.bold(slug)} has been enabled in ${chalk.bold(environment)}`,
      defaultMessage: (environment: string) =>
        `Enabled for ${environment} via CLI`,
    };
  }

  if (flag.kind === 'boolean' && variant.value === false) {
    return {
      spinner: (environment: string) => `Disabling flag in ${environment}...`,
      success: (slug: string, environment: string) =>
        `Feature flag ${chalk.bold(slug)} has been disabled in ${chalk.bold(environment)}`,
      defaultMessage: (environment: string) =>
        `Disabled for ${environment} via CLI`,
    };
  }

  return {
    spinner: (environment: string) => `Setting variant in ${environment}...`,
    success: (slug: string, environment: string) =>
      `Feature flag ${chalk.bold(slug)} has been set in ${chalk.bold(environment)}`,
    defaultMessage: (environment: string) =>
      `Set variant for ${environment} via CLI`,
  };
}
