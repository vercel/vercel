import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
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
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a resource',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Delete a resource',
      value: [
        `${packageName} integration-resource remove <resource>`,
        `${packageName} integration-resource remove my-acme-resource`,
      ],
    },
    {
      name: 'Disconnect all projects from a resource, then delete it',
      value: [
        `${packageName} integration-resource remove <resource> --disconnect-all`,
        `${packageName} integration-resource remove my-acme-resource --disconnect-all`,
        `${packageName} integration-resource remove my-acme-resource -a`,
      ],
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration-resource remove my-acme-resource --format=json --yes`,
    },
  ],
} as const;

export const disconnectSubcommand = {
  name: 'disconnect',
  aliases: [],
  description: 'Disconnect a resource from a project, or the current project',
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
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when disconnecting a resource',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Disconnect a resource from the current project',
      value: [
        `${packageName} integration-resource disconnect <resource>`,
        `${packageName} integration-resource disconnect my-acme-resource`,
      ],
    },
    {
      name: 'Disconnect all projects from a resource',
      value: [
        `${packageName} integration-resource disconnect <resource> --all`,
        `${packageName} integration-resource disconnect my-acme-resource --all`,
        `${packageName} integration-resource disconnect my-acme-resource -a`,
      ],
    },
    {
      name: 'Disconnect a resource from a specified project',
      value: [
        `${packageName} integration-resource disconnect <resource> <project>`,
        `${packageName} integration-resource disconnect my-acme-resource my-project`,
      ],
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration-resource disconnect my-acme-resource --format=json --yes`,
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
      name: 'create threshold',
      value: [
        `${packageName} integration-resource create-threshold <resource> <minimum> <spend> <limit> [options]`,
        `${packageName} integration-resource create-threshold my-acme-resource 50 100 2000`,
        `${packageName} integration-resource create-threshold my-acme-resource 50 100 2000 --yes`,
      ],
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
  ],
  examples: [
    {
      name: 'Claim a sandbox resource by name',
      value: [
        `${packageName} integration-resource claim <resource>`,
        `${packageName} integration-resource claim my-stripe`,
      ],
    },
    {
      name: 'Pick a sandbox resource interactively (current team)',
      value: `${packageName} integration-resource claim`,
    },
    {
      name: 'Print the claim URL as JSON without waiting',
      value: `${packageName} integration-resource claim my-stripe --format=json --no-wait`,
    },
  ],
} as const;

export const integrationResourceCommand = {
  name: 'integration-resource',
  aliases: ['ir'],
  description: 'Manage marketplace integration resources',
  options: [],
  arguments: [],
  subcommands: [
    createThresholdSubcommand,
    disconnectSubcommand,
    removeSubcommand,
    claimSubcommand,
  ],
  examples: [],
} as const;
