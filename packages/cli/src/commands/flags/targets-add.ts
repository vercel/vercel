import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import {
  getBooleanVariant,
  resolveFlagUpdateMessage,
} from '../../util/flags/environment-variant';
import { resolveVariantOrThrow } from '../../util/flags/resolve-variant';
import {
  addFlagTargets,
  buildTargetsEnvironmentConfig,
  formatFlagTargetSelector,
  parseFlagTargetInputs,
} from '../../util/flags/targets';
import {
  MAX_LABEL_OPERATIONS,
  updateEntityLabelsBulk,
} from '../../util/flags/entity-labels';
import type {
  EntityLabelResult,
  EntityLabelsResponse,
} from '../../util/flags/entity-labels';
import { resolveTargetingLabel } from '../../util/flags/format-flag-details';
import type { FlagTargetSelector } from '../../util/flags/targets';
import { quoteArg } from '../../util/flags/quote-arg';
import { isAPIError } from '../../util/errors-ts';
import output from '../../output-manager';
import { FlagsTargetsCommandTelemetryClient } from '../../util/telemetry/commands/flags/targets';
import { targetsAddSubcommand } from './command';
import {
  isExitCodeResult,
  resolveRulesCommandContext,
  warnIfRuleChangesAreBypassed,
} from './rules-common';
import { formatTargetValue, formatTargetVariant } from './targets-common';
import type { Flag, FlagSettings, FlagVariant } from '../../util/flags/types';

const EXAMPLE =
  'flags targets add my-feature --environment production user.id=user_123';

export default async function targetsAdd(
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
    targetsAddSubcommand.options
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
  const variantSelector = normalizeOptionalInput(
    flags['--variant'] as string | undefined
  );
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliArgumentTarget(targetInputs);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionVariant(variantSelector);
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
    const context = await resolveRulesCommandContext(client, {
      projectName: flags['--project'],
      flagArg,
      environment,
      promptMessage: 'Select an environment to add targets to:',
      fetchSettings: true,
    });
    if (isExitCodeResult(context)) {
      return context.exitCode;
    }
    if (!context.settings) {
      throw new Error('Flag settings are required to add targets.');
    }

    const selectors = parseFlagTargetInputs(targetInputs, context.settings);
    const variant = resolveTargetVariant(context.flag, variantSelector);
    if (!variant) {
      return 2;
    }

    const { targets, results } = addFlagTargets(
      context.envConfig.targets,
      selectors,
      variant.id
    );
    const changed = results.filter(result => result.status !== 'unchanged');
    const variantSummary = formatTargetVariant(context.flag, variant.id);
    const labelItems = buildLabelItems(selectors, context.settings);

    if (changed.length === 0 && labelItems.length === 0) {
      if (json) {
        writeJson(client, context.flag.slug, context.environment, targets);
        return 0;
      }
      output.warn(
        `${plural('target', results.length, true)} already ${results.length === 1 ? 'serves' : 'serve'} ${variantSummary} in ${chalk.bold(context.environment)}; nothing to change`
      );
      return 0;
    }

    let updatedFlag = context.flag;
    if (changed.length > 0) {
      const defaultMessage = `Add ${plural('target', changed.length, true)} to ${context.environment}`;
      const updateMessage = json
        ? (message ?? defaultMessage)
        : await resolveFlagUpdateMessage(client, message, defaultMessage);

      output.spinner(`Adding targets to ${context.environment}...`);
      updatedFlag = await updateFlag(client, context.projectId, flagArg, {
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
    }

    const labels = await saveLabels(client, context.projectId, labelItems);
    const finalTargets =
      updatedFlag.environments[context.environment]?.targets ?? targets;

    if (json) {
      writeJson(
        client,
        updatedFlag.slug,
        context.environment,
        finalTargets,
        labels
      );
      return labels && labels.errors.length > 0 ? 1 : 0;
    }

    const labelSummary =
      labels && labels.labels.length > 0
        ? ` ${chalk.dim(`(${plural('label', labels.labels.length, true)} set)`)}`
        : '';
    if (changed.length > 0) {
      output.success(
        `${plural('target', changed.length, true)} added to ${chalk.bold(context.flag.slug)} in ${chalk.bold(context.environment)}${labelSummary}`
      );
    } else {
      output.success(
        `Targets of ${chalk.bold(context.flag.slug)} in ${chalk.bold(context.environment)} unchanged${labelSummary}`
      );
    }
    const failedLabelKeys = new Set(
      (labels?.errors ?? []).map(
        error => `${error.entityKind}.${error.attributeKey}=${error.value}`
      )
    );
    for (const result of results) {
      const selector = failedLabelKeys.has(formatFlagTargetSelector(result))
        ? { ...result, label: undefined }
        : result;
      const value = formatTargetValue(selector, context.settings);
      if (result.status === 'moved' && result.previousVariantId) {
        output.log(
          `  ${value} ${chalk.dim('→')} ${variantSummary} ${chalk.dim(`(moved from ${formatTargetVariant(context.flag, result.previousVariantId)})`)}`
        );
      } else if (result.status === 'unchanged') {
        output.log(
          `  ${value} ${chalk.dim('→')} ${variantSummary} ${chalk.dim('(unchanged)')}`
        );
      } else {
        output.log(`  ${value} ${chalk.dim('→')} ${variantSummary}`);
      }
    }
    warnIfRuleChangesAreBypassed(updatedFlag, context.environment, 'target');

    if (labels && labels.errors.length > 0) {
      output.warn(
        `${plural('label', labels.errors.length, true)} ${labels.errors.length === 1 ? 'was' : 'were'} not saved. The targets above are in place; set the labels again with:`
      );
      for (const error of labels.errors) {
        const item = labelItems.find(
          candidate =>
            candidate.entityKind === error.entityKind &&
            candidate.attributeKey === error.attributeKey &&
            candidate.value === error.value
        );
        output.print(`  ${chalk.dim(`${error.code}: ${error.message}`)}\n`);
        output.print(
          `  ${getCommandName(
            [
              'flags labels set',
              quoteArg(`${error.entityKind}.${error.attributeKey}`),
              quoteArg(error.value),
              quoteArg(item && 'label' in item ? item.label : ''),
            ].join(' ')
          )}\n`
        );
      }
      return 1;
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function resolveTargetVariant(
  flag: Flag,
  variantSelector: string | undefined
): FlagVariant | undefined {
  if (variantSelector) {
    return resolveVariantOrThrow(variantSelector, flag.variants, '--variant');
  }

  if (flag.kind === 'boolean') {
    return getBooleanVariant(flag, true);
  }

  output.error(
    `Missing required option --variant. Flag ${chalk.bold(flag.slug)} is a ${flag.kind} flag, so choose which variant the targets receive.`
  );
  output.log(
    `Example: ${getCommandName(`flags targets add ${flag.slug} --environment production --variant <VARIANT> user.id=user_123`)}`
  );
  return undefined;
}

function buildLabelItems(
  selectors: FlagTargetSelector[],
  settings: FlagSettings
): EntityLabelResult[] {
  const items = selectors
    .filter(
      (selector): selector is FlagTargetSelector & { label: string } =>
        selector.label !== undefined &&
        selector.label !==
          resolveTargetingLabel(
            settings,
            selector.entity,
            selector.attribute,
            selector.value
          )
    )
    .map(selector => ({
      operation: 'upsert' as const,
      entityKind: selector.entity,
      attributeKey: selector.attribute,
      value: selector.value,
      label: selector.label,
    }));

  if (items.length > MAX_LABEL_OPERATIONS) {
    throw new Error(
      `Cannot set more than ${MAX_LABEL_OPERATIONS} labels at once. Split the targets into smaller batches.`
    );
  }

  return items;
}

/**
 * Labels live in the project's flag settings, not on the flag, so they are a
 * second write. A failure here must not look like a failed target write: the
 * API error is folded into the per-item `errors` list so the caller can report
 * the targets as saved and the labels as pending.
 */
async function saveLabels(
  client: Client,
  projectId: string,
  items: EntityLabelResult[]
): Promise<EntityLabelsResponse | undefined> {
  if (items.length === 0) {
    return undefined;
  }

  output.spinner('Saving labels...');
  try {
    return await updateEntityLabelsBulk(client, projectId, items);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      labels: [],
      errors: items.map(item => ({
        entityKind: item.entityKind,
        attributeKey: item.attributeKey,
        value: item.value,
        code: isAPIError(err) ? (err.code ?? 'api_error') : 'error',
        message,
      })),
    };
  } finally {
    output.stopSpinner();
  }
}

function writeJson(
  client: Client,
  flag: string,
  environment: string,
  targets: unknown,
  labels?: EntityLabelsResponse
) {
  client.stdout.write(
    `${JSON.stringify(
      { flag, environment, targets, ...(labels ? { labels } : {}) },
      null,
      2
    )}\n`
  );
}
