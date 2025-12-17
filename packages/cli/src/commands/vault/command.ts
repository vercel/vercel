import { packageName } from '../../util/pkg-name';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Create a new secret in Vercel Vault',
  arguments: [
    {
      name: 'name',
      required: true,
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
      description: 'Create as a team-level (global) secret',
      shorthand: 'g',
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Create a project-specific secret',
      value: [`${packageName} vault add database-url`],
    },
    {
      name: 'Create a global (team-level) secret',
      value: [`${packageName} vault add shared-api-key --global`],
    },
    {
      name: 'Create a secret for a specific environment',
      value: [`${packageName} vault add api-key --environment preview`],
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update (patch) an existing secret in Vercel Vault',
  arguments: [
    {
      name: 'name',
      required: true,
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
      description: 'Update a team-level (global) secret',
      shorthand: 'g',
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Update a project-specific secret',
      value: [`${packageName} vault update database-url`],
    },
    {
      name: 'Update a global (team-level) secret',
      value: [`${packageName} vault update shared-api-key --global`],
    },
    {
      name: 'Rotate keys in a secret for preview environment',
      value: [`${packageName} vault update api-config --environment preview`],
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
