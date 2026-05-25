import { randomBytes } from 'node:crypto';
import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { createFlag } from '../../util/flags/create-flag';
import output from '../../output-manager';
import { FlagsCreateTelemetryClient } from '../../util/telemetry/commands/flags/add';
import { createSubcommand } from './command';
import { formatProject } from '../../util/projects/format-project';
import { printFlagDetails } from '../../util/flags/print-flag-details';
import type {
  CreateFlagRequest,
  FlagEnvironmentConfig,
  FlagKind,
  FlagVariant,
  FlagVariantValue,
} from '../../util/flags/types';

// Generate a variant ID (21 chars, alphanumeric)
function variantId(size = 21): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsCreateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(createSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [slug] = args;

  if (!slug) {
    output.error('Please provide a slug for the feature flag');
    output.log(`Example: ${getCommandName('flags create my-feature')}`);
    return 1;
  }

  const kind = (flags['--kind'] as FlagKind | undefined) || 'boolean';
  const description = flags['--description'] as string | undefined;
  const variantInputs = (flags['--variant'] as string[] | undefined) || [];

  telemetryClient.trackCliArgumentSlug(slug);
  telemetryClient.trackCliOptionKind(kind);
  telemetryClient.trackCliOptionDescription(description);

  if (
    kind !== 'boolean' &&
    kind !== 'string' &&
    kind !== 'number' &&
    kind !== 'json'
  ) {
    output.error(
      `Invalid kind: ${kind}. Must be one of: boolean, string, number, json`
    );
    return 1;
  }

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
  const projectSlugLink = formatProject(link.org.slug, project.name);

  let variants: FlagVariant[];
  try {
    variants = await getVariants(client, kind, variantInputs);
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  const request: CreateFlagRequest = {
    slug,
    kind,
    description: description || '',
    variants,
    environments: {
      production: createEnvironmentConfig(
        variants[0].id,
        variants[0].id,
        false
      ),
      preview: createEnvironmentConfig(variants[0].id, variants[0].id, false),
      development: createEnvironmentConfig(
        kind === 'boolean' ? variants[1].id : variants[0].id,
        kind === 'boolean' ? variants[1].id : variants[0].id,
        false
      ),
    },
  };

  try {
    output.spinner('Creating feature flag...');
    const flag = await createFlag(client, project.id, request);
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} created successfully`
    );
    printFlagDetails({
      flag,
      projectSlugLink,
      orgSlug: link.org.slug,
      projectName: project.name,
      showTimestamps: false,
    });
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

async function getVariants(
  client: Client,
  kind: FlagKind,
  variantInputs: string[]
): Promise<FlagVariant[]> {
  if (kind === 'boolean') {
    if (variantInputs.length > 0) {
      throw new Error(
        'Boolean flags always use true/false variants. Omit --variant when creating a boolean flag.'
      );
    }

    return getDefaultVariants(kind);
  }

  if (variantInputs.length > 0) {
    return variantInputs.map((input, index) =>
      parseVariantInput(input, kind, index)
    );
  }

  if (!client.stdin.isTTY) {
    throw new Error(
      'Missing required flag --variant. Use --variant <value>[=label] (repeat as needed), or run interactively in a terminal.'
    );
  }

  return collectVariantsInteractively(client, kind);
}

async function collectVariantsInteractively(
  client: Client,
  kind: 'string' | 'number' | 'json'
): Promise<FlagVariant[]> {
  const variants: FlagVariant[] = [];
  let addAnother = true;

  while (addAnother || variants.length === 0) {
    const variantNumber = variants.length + 1;
    const valueInput = await client.input.text({
      message:
        kind === 'json'
          ? `Enter JSON value for variant ${variantNumber}:`
          : `Enter value for variant ${variantNumber}:`,
      validate: value => {
        const result = validateVariantValue(value, kind);
        return result === null ? true : result;
      },
    });
    const label = await client.input.text({
      message: `Enter an optional label for variant ${variantNumber}:`,
    });

    variants.push(
      parseVariantInput(
        formatVariantInput(valueInput, label),
        kind,
        variants.length
      )
    );
    addAnother = await client.input.confirm('Add another variant?', false);
  }

  return variants;
}

function createEnvironmentConfig(
  pausedVariantId: string,
  fallthroughVariantId: string,
  active: boolean
): FlagEnvironmentConfig {
  return {
    revision: 0,
    active,
    pausedOutcome: {
      type: 'variant',
      variantId: pausedVariantId,
    },
    fallthrough: {
      type: 'variant',
      variantId: fallthroughVariantId,
    },
    rules: [],
    reuse: {
      active: false,
      environment: '',
    },
  };
}

function formatVariantInput(valueInput: string, label: string): string {
  const trimmedLabel = label.trim();
  return trimmedLabel ? `${valueInput}=${trimmedLabel}` : valueInput;
}

function parseVariantInput(
  input: string,
  kind: 'string' | 'number' | 'json',
  index: number
): FlagVariant {
  const { rawValue, rawLabel } = splitVariantInput(input, kind);

  const validationError = validateVariantValue(rawValue, kind);
  if (validationError) {
    throw new Error(`Invalid variant "${input}": ${validationError}`);
  }

  return {
    id: variantId(),
    value: parseVariantValue(rawValue, kind),
    label: getVariantLabel(rawLabel, kind, index),
    description: '',
  };
}

function splitVariantInput(
  input: string,
  kind: 'string' | 'number' | 'json'
): { rawValue: string; rawLabel?: string } {
  if (kind !== 'json') {
    const separatorIndex = input.indexOf('=');
    return {
      rawValue:
        separatorIndex === -1
          ? input.trim()
          : input.slice(0, separatorIndex).trim(),
      rawLabel:
        separatorIndex === -1
          ? undefined
          : input.slice(separatorIndex + 1).trim() || undefined,
    };
  }

  const trimmed = input.trim();
  if (isValidJsonVariantValue(trimmed)) {
    return { rawValue: trimmed };
  }

  for (let index = trimmed.length - 1; index >= 0; index--) {
    if (trimmed[index] !== '=') {
      continue;
    }

    const rawValue = trimmed.slice(0, index).trim();
    const rawLabel = trimmed.slice(index + 1).trim();
    if (!rawValue || !isValidJsonVariantValue(rawValue)) {
      continue;
    }

    return {
      rawValue,
      rawLabel: rawLabel || undefined,
    };
  }

  return { rawValue: trimmed };
}

function getVariantLabel(
  rawLabel: string | undefined,
  kind: 'string' | 'number' | 'json',
  index: number
): string | undefined {
  if (rawLabel) {
    return rawLabel;
  }

  if (kind === 'json') {
    return `Variant ${index + 1}`;
  }

  return undefined;
}

function validateVariantValue(
  value: string,
  kind: 'string' | 'number' | 'json'
): string | null {
  if (!value.trim()) {
    return 'value cannot be empty';
  }

  if (kind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 'number variants must be valid numeric values';
    }
  }

  if (kind === 'json' && !isValidJsonVariantValue(value)) {
    return 'JSON variants must be valid JSON';
  }

  return null;
}

function parseVariantValue(
  value: string,
  kind: 'string' | 'number' | 'json'
): FlagVariantValue {
  if (kind === 'number') {
    return Number(value);
  }

  if (kind === 'json') {
    return JSON.parse(value) as FlagVariantValue;
  }

  return value;
}

function getDefaultVariants(kind: FlagKind): FlagVariant[] {
  switch (kind) {
    case 'boolean':
      return [
        {
          id: variantId(),
          value: false,
          label: 'Off',
          description: 'not enabled',
        },
        {
          id: variantId(),
          value: true,
          label: 'On',
          description: 'enabled',
        },
      ];
    case 'string':
    case 'number':
    case 'json':
      throw new Error(`Default variants are not supported for kind: ${kind}`);
  }
}

function isValidJsonVariantValue(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
