import chalk from 'chalk';
import output from '../../output-manager';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { canPrompt } from '../../util/can-prompt';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import {
  findForeignCreateFlags,
  getStorageProvider,
  listStorageProviderTypes,
  STORAGE_PROVIDERS,
  type CreateFlags,
  type StorageProvider,
} from '../../util/storage/providers';
import { StorageCreateTelemetryClient } from '../../util/telemetry/commands/storage/create';
import { createSubcommand } from './command';
import { failWith, labelFor, resolveStorageAccount } from './shared';

/** The document `storage create --json` writes to stdout. */
export interface StorageCreateResult {
  status: 'ok';
  store: {
    id: string;
    name: string;
    type: string;
    product: string;
    details: Record<string, string | number | boolean | null>;
  };
  next: Array<{ command: string; when?: string }>;
}

export async function create(client: Client, argv: string[]): Promise<number> {
  const telemetry = new StorageCreateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(createSubcommand.options);
  let parsedArguments;
  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  const { args, flags } = parsedArguments;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;
  const name = args[0];

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliArgumentName(name);
  telemetry.trackCliOptionType(flags['--type']);
  telemetry.trackCliOptionAccess(flags['--access']);
  telemetry.trackCliOptionRegion(flags['--region']);
  telemetry.trackCliOptionItems(flags['--items']);

  if (!name) {
    return failWith(client, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message:
        'You must specify a name for the store. See `--help` for details.',
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'storage create <name> --type <type>'
          ),
          when: `replace <name> and <type> (${listStorageProviderTypes().join(', ')})`,
        },
      ],
    });
  }

  if (args.length > 1) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message:
        'Too many arguments. Usage: `vercel storage create <name> --type <type>`.',
    });
  }

  const interactive = canPrompt(client);

  // Prompting after the store exists would flake agents into duplicates, so
  // every input is settled before the request goes out.
  const provider = await resolveProvider(client, flags['--type'], interactive);
  if (typeof provider === 'number') {
    return provider;
  }

  const foreignFlags = findForeignCreateFlags(provider, flags as CreateFlags);
  if (foreignFlags.length > 0) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `${foreignFlags.join(', ')} ${foreignFlags.length === 1 ? 'does' : 'do'} not apply to ${provider.label} stores.`,
    });
  }

  const validation = await provider.validateCreate(flags as CreateFlags, {
    prompt: interactive
      ? {
          select: (message, choices) =>
            client.input.select({ message, choices }),
        }
      : undefined,
  });
  if (!validation.valid) {
    return failWith(client, {
      reason: validation.reason,
      message: validation.message,
    });
  }

  const account = await resolveStorageAccount(client);
  if (typeof account === 'number') {
    return account;
  }

  output.spinner(`Creating ${provider.label} store…`, 500);
  let created;
  try {
    created = await provider.create(client, {
      name,
      params: validation.params,
      accountId: account.accountId,
    });
  } catch (error) {
    output.stopSpinner();
    return failWith(client, {
      reason: AGENT_REASON.API_ERROR,
      message: `Failed to create the store: ${(error as Error).message}`,
    });
  }
  output.stopSpinner();

  // `storage connect` needs a project: the linked one, or `--project` when
  // run from an unlinked directory (create itself only needs the team).
  const connectCommand = account.linkedProject
    ? `storage connect ${created.name}`
    : `storage connect ${created.name} --project <project>`;
  const next = [
    {
      command: getCommandNamePlain(`${connectCommand} --yes`),
      when: account.linkedProject
        ? 'connect the new store to the linked project'
        : 'connect the new store to a project (replace <project>)',
    },
  ];

  if (asJson) {
    const result: StorageCreateResult = {
      status: 'ok',
      store: {
        id: created.id,
        name: created.name,
        type: provider.type,
        product: provider.label,
        details: created.details,
      },
      next,
    };
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  printAlignedLabel('Created', created.name, { gutter: '✓' });
  printAlignedLabel('ID', created.id);
  printAlignedLabel('Type', provider.label);
  for (const [key, value] of Object.entries(created.details)) {
    if (value !== null && value !== '') {
      printAlignedLabel(labelFor(key), String(value));
    }
  }
  output.print('\n');
  output.log(
    `Run ${chalk.cyan(getCommandName(connectCommand))} to connect it to a project.`
  );
  return 0;
}

async function resolveProvider(
  client: Client,
  typeFlag: string | undefined,
  interactive: boolean
): Promise<StorageProvider | number> {
  if (typeFlag) {
    const provider = getStorageProvider(typeFlag);
    if (!provider) {
      return failWith(client, {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Unknown store type "${typeFlag}". Known types: ${listStorageProviderTypes().join(', ')}.`,
        hint: 'Marketplace resources (Neon, Upstash, Supabase, …) are created with `vercel integration add <integration>`.',
        next: [
          {
            command: getCommandNamePlain('integration add <integration>'),
            when: 'provision a Marketplace resource (replace <integration>)',
          },
        ],
      });
    }
    return provider;
  }

  if (interactive) {
    return client.input.select<StorageProvider>({
      message: 'Choose the type of store to create',
      choices: STORAGE_PROVIDERS.map(provider => ({
        name: provider.label,
        value: provider,
      })),
    });
  }

  return failWith(client, {
    reason: AGENT_REASON.MISSING_ARGUMENTS,
    message: `You must specify --type. Known types: ${listStorageProviderTypes().join(', ')}.`,
    next: STORAGE_PROVIDERS.map(provider => ({
      command: buildCommandWithGlobalFlags(
        client.argv,
        `storage create <name> --type ${provider.type}`
      ),
      when: `create a ${provider.label} store (replace <name>)`,
    })),
  });
}
