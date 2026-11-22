import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

const timeoutOption = {
  name: 'timeout',
  description: 'Time to wait for promotion completion (default: 3m)',
  argument: 'TIME',
  shorthand: null,
  type: String,
  deprecated: false,
} as const;

export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description: 'Show the status of any current pending promotions',
  arguments: [
    {
      name: 'project',
      required: false,
    },
  ],
  options: [
    timeoutOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when linking a Project',
    },
  ],
  examples: [
    {
      name: 'Show status for the linked project',
      value: `${packageName} promote status`,
    },
    {
      name: 'Show status for a named project',
      placeholders: ['<project>'],
      value: `${packageName} promote status <project>`,
    },
    {
      name: 'Wait up to 30 seconds for status',
      value: `${packageName} promote status --timeout 30s`,
    },
  ],
} as const;

export const promoteCommand = {
  name: 'promote',
  aliases: [],
  description: 'Promote an existing Deployment to current',
  arguments: [
    {
      name: 'deployment',
      required: true,
    },
  ],
  subcommands: [statusSubcommand],
  options: [
    timeoutOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when linking a Project',
    },
  ],
  examples: [
    {
      name: 'Promote a Deployment using ID or URL',
      placeholders: ['<DEPLOYMENT>'],
      value: `${packageName} promote <DEPLOYMENT>`,
    },
  ],
} as const;
