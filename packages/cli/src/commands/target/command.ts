import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const targetCommand: Command = {
  name: 'targets',
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
  options: [],
  examples: [
    {
      name: 'List all targets for the current project',
      value: `${packageName} target ls my-project`,
    },
  ],
};
