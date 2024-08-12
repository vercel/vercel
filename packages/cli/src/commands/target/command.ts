import { packageName } from '../../util/pkg-name';
import { nextOption } from '../../util/arg-common';

export const targetCommand = {
  name: 'target',
  description: 'Manage your Vercel Project\'s "targets" (custom environments).',
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'ls',
      description: 'Show all targets in the current project',
      arguments: [],
      options: [],
      examples: [],
    },
  ],
  options: [nextOption],
  examples: [
    {
      name: 'List all targets for the current project',
      value: `${packageName} target ls my-project`,
    },
  ],
} as const;
