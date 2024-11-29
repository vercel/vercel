import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

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
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when linking a Project',
    },
  ],
  examples: [
    {
      name: 'Show the status of any current pending promotions',
      value: [
        `${packageName} promote status`,
        `${packageName} promote status <project>`,
        `${packageName} promote status --timeout 30s`,
      ],
    },
  ],
} as const;

export const promoteCommand = {
  name: 'promote',
  aliases: [],
  description: 'Promote an existing Deployment to current',
  arguments: [
    {
      name: 'url|deploymentId',
      required: true,
    },
  ],
  subcommands: [statusSubcommand],
  options: [
    {
      name: 'timeout',
      description: 'Time to wait for promotion completion [3m]',
      argument: 'TIME',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when linking a Project',
    },
  ],
  examples: [
    {
      name: 'Promote a Deployment using ID or URL',
      value: `${packageName} promote <deployment id|url>`,
    },
  ],
} as const;
