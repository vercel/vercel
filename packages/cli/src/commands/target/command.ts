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
      name: 'Add a new project',
      value: `${packageName} project add my-project`,
    },
    {
      name: 'Paginate projects, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} project ls --next 1584722256178`,
    },
  ],
};
