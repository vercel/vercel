import { randomBytes } from 'node:crypto';
import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { createFlag } from '../../util/flags/create-flag';
import output from '../../output-manager';
import { FlagsCreateTelemetryClient } from '../../util/telemetry/commands/flags/add';
import { createSubcommand } from './command';
import { formatProject } from '../../util/projects/format-project';
import { printFlagDetails } from '../../util/flags/print-flag-details';
import type {
  CreateFlagRequest,
  FlagEnvironmentConfig,
  FlagVariant,
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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: 'Please provide a slug for the feature flag.',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'flags add <slug>'
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error('Please provide a slug for the feature flag');
    output.log(`Example: ${getCommandName('flags create my-feature')}`);
    return 1;
  }

  const kind =
    (flags['--kind'] as 'boolean' | 'string' | 'number') || 'boolean';
  const description = flags['--description'] as string | undefined;
  const variantInputs = (flags['--variant'] as string[] | undefined) || [];

  telemetryClient.trackCliArgumentSlug(slug);
  telemetryClient.trackCliOptionKind(kind);
  telemetryClient.trackCliOptionDescription(description);

  if (kind !== 'boolean' && kind !== 'string' && kind !== 'number') {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: `Invalid kind: ${kind}. Must be one of: boolean, string, number.`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `flags add ${slug} --kind <boolean|string|number>`
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Invalid kind: ${kind}. Must be one of: boolean, string, number`
    );
    return 1;
  }

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          message: 'Your codebase is not linked to a project. Run link first.',
          next: [
            {
              command: buildCommandWithGlobalFlags(client.argv, 'link'),
            },
          ],
        },
        1
      );
      return 1;
    }
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
    if (!client.nonInteractive) {
      output.spinner('Creating feature flag...');
    }
    const flag = await createFlag(client, project.id, request);
    output.stopSpinner();

    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'ok',
            flag: { id: flag.id, slug: flag.slug, kind: flag.kind },
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `flags inspect ${flag.slug}`
                ),
                when: 'Inspect the new flag',
              },
            ],
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

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
  kind: 'boolean' | 'string' | 'number',
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
    return variantInputs.map(input => parseVariantInput(input, kind));
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
  kind: 'string' | 'number'
): Promise<FlagVariant[]> {
  const variants: FlagVariant[] = [];
  let addAnother = true;

  while (addAnother || variants.length === 0) {
    const variantNumber = variants.length + 1;
    const valueInput = await client.input.text({
      message: `Enter value for variant ${variantNumber}:`,
      validate: value => {
        const result = validateVariantValue(value, kind);
        return result === null ? true : result;
      },
    });
    const label = await client.input.text({
      message: `Enter an optional label for variant ${variantNumber}:`,
    });

    variants.push(
      parseVariantInput(formatVariantInput(valueInput, label), kind)
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
  kind: 'string' | 'number'
): FlagVariant {
  const separatorIndex = input.indexOf('=');
  const rawValue =
    separatorIndex === -1
      ? input.trim()
      : input.slice(0, separatorIndex).trim();
  const rawLabel =
    separatorIndex === -1 ? undefined : input.slice(separatorIndex + 1).trim();

  const validationError = validateVariantValue(rawValue, kind);
  if (validationError) {
    throw new Error(`Invalid variant "${input}": ${validationError}`);
  }

  return {
    id: variantId(),
    value: parseVariantValue(rawValue, kind),
    label: rawLabel || undefined,
    description: '',
  };
}

function validateVariantValue(
  value: string,
  kind: 'string' | 'number'
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

  return null;
}

function parseVariantValue(
  value: string,
  kind: 'string' | 'number'
): string | number {
  if (kind === 'number') {
    return Number(value);
  }

  return value;
}

function getDefaultVariants(
  kind: 'boolean' | 'string' | 'number'
): FlagVariant[] {
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
      throw new Error(`Default variants are not supported for kind: ${kind}`);
  }
}
