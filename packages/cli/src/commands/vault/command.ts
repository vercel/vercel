import { packageName } from '../../util/pkg-name';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add key-value pairs to Vercel Vault',
  arguments: [
    {
      name: 'key value',
      required: false,
    },
  ],
  options: [
    {
      name: 'project',
      description: 'Project ID or name (defaults to linked project)',
      shorthand: null,
      type: String,
      argument: 'PROJECT',
      deprecated: false,
    },
    {
      name: 'environment',
      description: 'Environment (production, preview, development)',
      shorthand: 'e',
      type: String,
      argument: 'ENV',
      deprecated: false,
    },
    {
      name: 'global',
      description: 'Store at team level (global)',
      shorthand: 'g',
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Add secrets interactively (prompts for key-value pairs)',
      value: [`${packageName} vault add --global`],
    },
    {
      name: 'Add a single secret',
      value: [`${packageName} vault add DATABASE_HOST localhost --global`],
    },
    {
      name: 'Add multiple secrets at once',
      value: [
        `${packageName} vault add DATABASE_HOST localhost DATABASE_PORT 5432 --global`,
      ],
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description:
    'Update key-value pairs in Vercel Vault (merges with existing keys)',
  arguments: [
    {
      name: 'key value',
      required: false,
    },
  ],
  options: [
    {
      name: 'project',
      description: 'Project ID or name (defaults to linked project)',
      shorthand: null,
      type: String,
      argument: 'PROJECT',
      deprecated: false,
    },
    {
      name: 'environment',
      description: 'Environment (production, preview, development)',
      shorthand: 'e',
      type: String,
      argument: 'ENV',
      deprecated: false,
    },
    {
      name: 'global',
      description: 'Update at team level (global)',
      shorthand: 'g',
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Update secrets interactively',
      value: [`${packageName} vault update --global`],
    },
    {
      name: 'Update a single secret',
      value: [`${packageName} vault update DATABASE_HOST newhost.com --global`],
    },
    {
      name: 'Update multiple secrets at once',
      value: [`${packageName} vault update API_KEY xyz API_TOKEN abc --global`],
    },
  ],
} as const;

export const vaultCommand = {
  name: 'vault',
  aliases: [],
  description: 'Manage secrets in Vercel Vault',
  arguments: [],
  subcommands: [addSubcommand, updateSubcommand],
  options: [],
  examples: [],
} as const;
