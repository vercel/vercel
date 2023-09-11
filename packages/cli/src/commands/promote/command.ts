import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const promoteCommand: Command = {
  name: 'promote',
  description: 'Promote an existing deployment to current.',
  arguments: [
    {
      name: 'deployment id/url',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'status',
      description: 'Show the status of any current pending promotions',
      arguments: [
        {
          name: 'project',
          required: false,
        },
      ],
      options: [],
      examples: [],
    },
  ],
  options: [
    {
      name: 'timeout',
      description: 'Time to wait for promotion completion [3m]',
      argument: 'timeout',
      shorthand: null,
      type: 'string',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Show the status of any current pending promotions',
      value: [
        `${packageName} promote`,
        `${packageName} promote status`,
        `${packageName} promote status <project>`,
        `${packageName} promote status --timeout 30s`,
      ],
    },
    {
      name: 'Promote a deployment using id or url',
      value: `${packageName} promote <deployment id/url>`,
    },
  ],
};
