import { formatOption, jsonOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const removeSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description: 'Delete an integration resource',
  arguments: [
    {
      name: 'resource',
      required: true,
    },
  ],
  options: [
    {
      name: 'disconnect-all',
      description:
        'Disconnects all projects from the specified resource before deletion',
      shorthand: null,
      deprecatedShorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a resource',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Delete a resource',
      placeholders: ['<resource>'],
      value: `${packageName} integration resource delete <resource>`,
    },
    {
      name: 'Disconnect all projects from a resource, then delete it',
      placeholders: ['<resource>'],
      value: `${packageName} integration resource delete <resource> --disconnect-all`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration resource delete my-acme-resource --json --yes`,
    },
  ],
} as const;

export const disconnectSubcommand = {
  name: 'disconnect',
  aliases: [],
  description:
    'Disconnect a marketplace resource from a project without deleting the resource',
  arguments: [
    {
      name: 'resource',
      required: true,
    },
    {
      name: 'project',
      required: false,
    },
  ],
  options: [
    {
      name: 'all',
      description: 'Disconnects all projects from the specified resource',
      // Disconnecting every project takes `--all` spelled out. The old `-a`
      // still works, hidden, until the next major.
      shorthand: null,
      deprecatedShorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when disconnecting a resource',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Disconnect a resource from the current project',
      placeholders: ['<resource>'],
      value: `${packageName} integration resource disconnect <resource>`,
    },
    {
      name: 'Disconnect all projects from a resource',
      placeholders: ['<resource>'],
      value: `${packageName} integration resource disconnect <resource> --all`,
    },
    {
      name: 'Disconnect a resource from a specified project',
      placeholders: ['<resource>', '<project>'],
      value: `${packageName} integration resource disconnect <resource> <project>`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration resource disconnect my-acme-resource --json --yes`,
    },
  ],
} as const;

export const connectSubcommand = {
  name: 'connect',
  aliases: [],
  description: 'Connect a marketplace resource to a project',
  arguments: [
    {
      name: 'resource',
      required: true,
    },
    {
      name: 'project',
      required: false,
    },
  ],
  options: [
    {
      name: 'environment',
      shorthand: 'e',
      type: [String],
      argument: 'ENVIRONMENT',
      deprecated: false,
      description:
        'Environment to connect (can be repeated; accepts production, preview, development, or a Custom Environment slug or ID) (default: all system Environments).',
    },
    {
      name: 'prefix',
      shorthand: null,
      type: String,
      argument: 'PREFIX',
      deprecated: false,
      description:
        'Prefix for environment variable names (e.g., --prefix NEON2_ creates NEON2_DATABASE_URL instead of DATABASE_URL)',
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when connecting a resource (required without a terminal)',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Connect a resource to the current project',
      placeholders: ['<resource>'],
      value: `${packageName} integration resource connect <resource>`,
    },
    {
      name: 'Connect a resource to a specified project',
      placeholders: ['<resource>', '<project>'],
      value: `${packageName} integration resource connect <resource> <project>`,
    },
    {
      name: 'Connect only to specific environments',
      value: [
        `${packageName} integration resource connect my-acme-resource -e production`,
        `${packageName} integration resource connect my-acme-resource -e production -e preview`,
        `${packageName} integration resource connect my-acme-resource -e qa`,
        `${packageName} integration resource connect my-acme-resource -e env_qa123`,
      ],
    },
    {
      name: 'Connect with a prefix for environment variable names',
      value: `${packageName} integration resource connect my-acme-resource --prefix NEON2_`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration resource connect my-acme-resource --json --yes`,
    },
  ],
} as const;

export const createThresholdSubcommand = {
  name: 'create-threshold',
  aliases: [],
  description:
    'Creates a threshold for a resource (or installation, if the integration uses installation-level thresholds)',
  arguments: [
    {
      name: 'resource',
      required: true,
    },
    {
      name: 'minimum',
      required: true,
    },
    {
      name: 'spend',
      required: true,
    },
    {
      name: 'limit',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when creating a threshold',
    },
  ],
  examples: [
    {
      name: 'Create a resource threshold',
      placeholders: ['<resource>', '<minimum>', '<spend>', '<limit>'],
      value: `${packageName} integration resource create-threshold <resource> <minimum> <spend> <limit>`,
    },
    {
      name: 'Create a resource threshold without confirmation',
      placeholders: ['<resource>', '<minimum>', '<spend>', '<limit>'],
      value: `${packageName} integration resource create-threshold <resource> <minimum> <spend> <limit> --yes`,
    },
  ],
} as const;

export const claimSubcommand = {
  name: 'claim',
  aliases: [],
  description:
    'Claim a sandbox marketplace resource (e.g. Stripe, Shopify) by opening the provider claim URL in your browser',
  arguments: [
    {
      name: 'resource',
      required: false,
    },
  ],
  options: [
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when claiming a single sandbox resource',
    },
    {
      name: 'no-wait',
      description:
        'Print the claim URL and exit without polling for completion',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Claim a sandbox resource by name',
      placeholders: ['<resource>'],
      value: `${packageName} integration resource claim <resource>`,
    },
    {
      name: 'Pick a sandbox resource interactively (current team)',
      value: `${packageName} integration resource claim`,
    },
    {
      name: 'Print the claim URL as JSON without waiting',
      value: `${packageName} integration resource claim my-stripe --json --no-wait`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: ['status'],
  description:
    'Show live details and status for a marketplace integration resource, fetched fresh from the provider',
  arguments: [
    {
      name: 'resource',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show live details and status for a resource',
      placeholders: ['<resource>'],
      value: `${packageName} integration resource inspect <resource>`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration resource inspect my-acme-resource --json`,
    },
  ],
} as const;

export const integrationResourceCommand = {
  name: 'integration-resource',
  aliases: ['ir'],
  summary: 'Manage integration resources',
  description:
    'Manage marketplace integration resources (alias for `vercel integration resource`)',
  options: [],
  arguments: [],
  subcommands: [
    connectSubcommand,
    createThresholdSubcommand,
    disconnectSubcommand,
    removeSubcommand,
    claimSubcommand,
    inspectSubcommand,
  ],
  examples: [],
} as const;
