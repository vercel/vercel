import { randomBytes } from 'node:crypto';
import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { createFlag } from '../../util/flags/create-flag';
import { getFlagDashboardUrl } from '../../util/flags/dashboard-url';
import output from '../../output-manager';
import { FlagsAddTelemetryClient } from '../../util/telemetry/commands/flags/add';
import { addSubcommand } from './command';
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

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
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
    output.log(`Example: ${getCommandName('flags add my-feature')}`);
    return 1;
  }

  const kind =
    (flags['--kind'] as 'boolean' | 'string' | 'number') || 'boolean';
  const description = flags['--description'] as string | undefined;

  telemetryClient.trackCliArgumentSlug(slug);
  telemetryClient.trackCliOptionKind(kind);
  telemetryClient.trackCliOptionDescription(description);

  if (kind !== 'boolean' && kind !== 'string' && kind !== 'number') {
    output.error(
      `Invalid kind: ${kind}. Must be one of: boolean, string, number`
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

  // Create default variants based on kind
  const defaultVariants = getDefaultVariants(kind);

  const defaultEnvConfig: FlagEnvironmentConfig = {
    revision: 0,
    active: false,
    pausedOutcome: {
      type: 'variant',
      variantId: defaultVariants[0].id,
    },
    fallthrough: {
      type: 'variant',
      variantId: defaultVariants[0].id,
    },
    rules: [],
    reuse: {
      active: false,
      environment: '',
    },
  };

  const request: CreateFlagRequest = {
    slug,
    kind,
    description: description || '',
    variants: defaultVariants,
    environments: {
      production: defaultEnvConfig,
      preview: defaultEnvConfig,
      development: defaultEnvConfig,
    },
  };

  try {
    output.spinner('Creating feature flag...');
    const flag = await createFlag(client, project.id, request);
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} created successfully`
    );
    output.log(`\n  ${chalk.dim('ID:')}    ${flag.id}`);
    output.log(`  ${chalk.dim('Kind:')}  ${flag.kind}`);
    output.log(`  ${chalk.dim('Slug:')}  ${flag.slug}\n`);

    output.log(
      `View in dashboard: ${chalk.cyan(getFlagDashboardUrl(link.org.slug, project.name, flag.slug))}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function getDefaultVariants(
  kind: 'boolean' | 'string' | 'number'
): FlagVariant[] {
  switch (kind) {
    case 'boolean':
      return [
        { id: variantId(), value: false, label: 'Off', description: '' },
        { id: variantId(), value: true, label: 'On', description: '' },
      ];
    case 'string':
      return [
        {
          id: variantId(),
          value: 'value-1',
          label: 'Value 1',
          description: '',
        },
        {
          id: variantId(),
          value: 'value-2',
          label: 'Value 2',
          description: '',
        },
      ];
    case 'number':
      return [
        { id: variantId(), value: 0, label: 'Off', description: '' },
        { id: variantId(), value: 1, label: 'On', description: '' },
      ];
  }
}
