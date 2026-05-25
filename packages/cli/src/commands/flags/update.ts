import chalk from 'chalk';
import deepEqual from 'fast-deep-equal';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import {
  formatVariantForDisplay,
  formatVariantValue,
  resolveVariant,
} from '../../util/flags/resolve-variant';
import { updateFlag } from '../../util/flags/update-flag';
import {
  normalizeOptionalInput,
  resolveOptionalInput,
} from '../../util/flags/normalize-optional-input';
import output from '../../output-manager';
import { FlagsUpdateTelemetryClient } from '../../util/telemetry/commands/flags/update';
import { updateSubcommand } from './command';
import type { Flag, FlagVariant } from '../../util/flags/types';

type ParsedVariantUpdate = {
  selector: string;
  valueInput?: string;
  label?: string;
};

interface VariantUpdateInput {
  selector?: string;
  valueInput?: string;
  label?: string;
}

const DEFAULT_UPDATE_MESSAGE = 'Updated via CLI';

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const variantSelector = normalizeOptionalInput(
    flags['--variant'] as string | undefined
  );
  const valueInput = normalizeOptionalInput(
    flags['--value'] as string | undefined
  );
  const label = normalizeOptionalInput(flags['--label'] as string | undefined);
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to update');
    output.log(
      `Example: ${getCommandName('flags update my-feature --variant control --value welcome-back --label "Welcome back"')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionVariant(variantSelector);
  telemetryClient.trackCliOptionValue(valueInput);
  telemetryClient.trackCliOptionLabel(label);
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
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be updated`
      );
      return 1;
    }

    const variantUpdate = await collectVariantUpdate(client, flag, {
      selector: variantSelector,
      valueInput,
      label,
    });

    const { variants, changedVariants } = applyVariantUpdates(flag, [
      variantUpdate,
    ]);

    if (changedVariants.length === 0) {
      output.warn(`Flag ${chalk.bold(flag.slug)} is already up to date`);
      return 0;
    }

    const updateMessage = await resolveOptionalInput(
      client,
      message,
      DEFAULT_UPDATE_MESSAGE,
      'Enter a message for this update:'
    );

    output.spinner('Updating flag...');
    await updateFlag(
      client,
      project.id,
      flagArg,
      updateMessage
        ? {
            variants,
            message: updateMessage,
          }
        : {
            variants,
          }
    );
    output.stopSpinner();

    output.success(`Feature flag ${chalk.bold(flag.slug)} has been updated`);
    for (const variant of changedVariants) {
      output.log(
        `  ${chalk.dim('Variant:')} ${formatVariantForDisplay(variant)}`
      );
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

async function collectVariantUpdate(
  client: Client,
  flag: Flag,
  input: VariantUpdateInput
): Promise<ParsedVariantUpdate> {
  const selectedVariant = await resolveSelectedVariant(
    client,
    flag,
    input.selector
  );
  let nextValueInput = input.valueInput;
  let nextLabel = input.label;

  if (
    flag.kind !== 'boolean' &&
    nextValueInput === undefined &&
    client.stdin.isTTY
  ) {
    nextValueInput = await promptForVariantValueUpdate(
      client,
      flag,
      selectedVariant
    );
  }

  if (nextLabel === undefined && client.stdin.isTTY) {
    nextLabel = await promptForVariantLabelUpdate(client, selectedVariant);
  }

  if (!client.stdin.isTTY) {
    ensureVariantUpdateInput(nextValueInput, nextLabel);
  }

  return {
    selector: selectedVariant.id,
    valueInput: nextValueInput,
    label: nextLabel,
  };
}

function ensureVariantUpdateInput(
  valueInput: string | undefined,
  label: string | undefined
) {
  if (!valueInput && !label) {
    throw new Error(
      'At least one of --value or --label must be provided. Use --value <VALUE>, --label <LABEL>, or run interactively in a terminal.'
    );
  }
}

async function resolveSelectedVariant(
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
    message: 'Select a variant to update:',
    choices: flag.variants.map(variant => ({
      name: `${formatVariantForDisplay(variant)} ${chalk.dim(`[id: ${variant.id}]`)}`,
      value: variant.id,
    })),
  });

  const selectedVariant = flag.variants.find(v => v.id === selectedVariantId);
  if (!selectedVariant) {
    throw new Error('No variant selected');
  }

  return selectedVariant;
}

async function promptForVariantValueUpdate(
  client: Client,
  flag: Flag,
  selectedVariant: FlagVariant
): Promise<string | undefined> {
  const valueResponse = await client.input.text({
    message: `Enter a new value for ${formatVariantForDisplay(selectedVariant)} (press Enter to keep ${formatVariantValue(selectedVariant.value)}):`,
    validate: value => {
      if (!value.trim()) {
        return true;
      }
      const result = validateVariantValue(value, flag.kind);
      return result === null ? true : result;
    },
  });

  return normalizeOptionalInput(valueResponse);
}

async function promptForVariantLabelUpdate(
  client: Client,
  selectedVariant: FlagVariant
): Promise<string | undefined> {
  const currentLabel = selectedVariant.label;
  const labelResponse = await client.input.text({
    message: currentLabel
      ? `Enter a new label for ${formatVariantForDisplay(selectedVariant)} (press Enter to keep ${JSON.stringify(currentLabel)}):`
      : `Enter an optional label for ${formatVariantForDisplay(selectedVariant)} (press Enter to skip):`,
  });

  return normalizeOptionalInput(labelResponse);
}

function applyVariantUpdates(
  flag: Flag,
  updates: ParsedVariantUpdate[]
): { variants: FlagVariant[]; changedVariants: FlagVariant[] } {
  const variants = flag.variants.map(variant => ({ ...variant }));
  const changedVariantIds = new Set<string>();

  for (const update of updates) {
    const result = resolveVariant(update.selector, variants);
    if (result.error || !result.variant) {
      throw new Error(result.error || `Variant "${update.selector}" not found`);
    }

    const nextValue =
      update.valueInput !== undefined
        ? parseUpdatedVariantValue(update.valueInput, flag.kind, result.variant)
        : result.variant.value;
    const nextLabel = update.label ?? result.variant.label;
    const variantIndex = variants.findIndex(v => v.id === result.variant!.id);
    const existingVariant = variants[variantIndex];

    const hasChanged =
      !deepEqual(existingVariant.value, nextValue) ||
      existingVariant.label !== nextLabel;

    variants[variantIndex] = {
      ...existingVariant,
      value: nextValue,
      label: nextLabel,
    };

    if (hasChanged) {
      changedVariantIds.add(existingVariant.id);
    }
  }

  return {
    variants,
    changedVariants: variants.filter(variant =>
      changedVariantIds.has(variant.id)
    ),
  };
}

function parseUpdatedVariantValue(
  valueInput: string,
  kind: Flag['kind'],
  existingVariant: FlagVariant
): FlagVariant['value'] {
  const validationError = validateVariantValue(valueInput, kind);
  if (validationError) {
    throw new Error(validationError);
  }

  if (kind === 'boolean') {
    const nextValue = valueInput.toLowerCase() === 'true';
    if (nextValue !== existingVariant.value) {
      throw new Error(
        'Boolean variant values cannot be changed. You can update the label only.'
      );
    }
    return nextValue;
  }

  if (kind === 'number') {
    return Number(valueInput);
  }

  if (kind === 'json') {
    return JSON.parse(valueInput) as FlagVariant['value'];
  }

  return valueInput;
}

function validateVariantValue(
  value: string,
  kind: Flag['kind']
): string | null {
  if (!value.trim()) {
    return 'Variant value cannot be empty';
  }

  if (kind === 'boolean') {
    const loweredValue = value.toLowerCase();
    if (loweredValue !== 'true' && loweredValue !== 'false') {
      return 'Boolean variant values must be true or false';
    }
  }

  if (kind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 'Number variants must be valid numeric values';
    }
  }

  if (kind === 'json') {
    try {
      JSON.parse(value);
    } catch {
      return 'JSON variant values must be valid JSON';
    }
  }

  return null;
}
